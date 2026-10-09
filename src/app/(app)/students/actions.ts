"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { phoneVariants } from "@/lib/phone";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { formatDate } from "@/lib/dates";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { changeBed, checkInStudent, checkOutStudent } from "@/lib/services/accommodation";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import {
  zCheckbox,
  zDate,
  zEmail,
  zId,
  zInt,
  zMoney,
  zOptDate,
  zOptText,
  zPassword,
  zPhone,
  zText,
} from "@/lib/validation/common";

function revalidateStudent(id?: string) {
  revalidatePath("/students");
  if (id) revalidatePath(`/students/${id}`);
  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  revalidatePath("/rent");
}

// ───────── Shared schema parts ─────────

const personalFields = {
  fullName: zText(120, "Full name"),
  phone: zPhone().transform((v) => v ?? ""), // required: never null at runtime
  email: zEmail(false),
  emergencyContactName: zOptText(120),
  emergencyContactPhone: zPhone(false),
  idNumber: zOptText(40),
  notes: zOptText(1000),
};

const rentFields = {
  monthlyRent: zMoney({ label: "Monthly rent", max: 1_000_000 }),
  rentDueDay: zInt(1, 28, "Rent due day"),
};

/** Email or phone used to sign in → the User column it belongs to. */
async function resolveLoginIdentifier(raw: string | null): Promise<{ email?: string; phone?: string }> {
  if (!raw) throw new ActionError("Enter an email or phone for the login.", { loginIdentifier: ["Required"] });
  const isEmail = raw.includes("@");
  const parsed = isEmail ? zEmail().safeParse(raw) : zPhone().safeParse(raw);
  if (!parsed.success) {
    throw new ActionError("Enter a valid email or phone for the login.", {
      loginIdentifier: [parsed.error.issues[0]?.message ?? "Invalid value"],
    });
  }
  const where = isEmail ? { email: parsed.data as string } : { phone: parsed.data as string };
  const clash = await db.user.findFirst({
    where: isEmail ? where : { phone: { in: phoneVariants(parsed.data as string) } },
    select: { id: true },
  });
  if (clash) {
    throw new ActionError("That login is already used by another account.", {
      loginIdentifier: [`This ${isEmail ? "email" : "phone"} already has an account`],
    });
  }
  return where;
}

function checkPassword(raw: string | undefined): string {
  const parsed = zPassword().safeParse(raw ?? "");
  if (!parsed.success) {
    throw new ActionError("Choose a stronger temporary password.", {
      loginPassword: [parsed.error.issues[0]?.message ?? "Invalid password"],
    });
  }
  return parsed.data;
}

// ───────── Create (+ optional check-in, optional login) ─────────

const createSchema = z.object({
  ...personalFields,
  ...rentFields,
  savePending: zCheckbox(),
  bedId: z.string().trim().max(64).optional(),
  moveInDate: zOptDate("Move-in date"),
  createLogin: zCheckbox(),
  loginIdentifier: zOptText(200),
  loginPassword: z.string().max(128).optional(),
});

export const createStudent = defineAction(
  { permission: "students.manage", schema: createSchema },
  async (input, user) => {
    if (!input.savePending) {
      const errors: Record<string, string[]> = {};
      if (!input.bedId) errors.bedId = ["Select a bed, or save as pending"];
      if (!input.moveInDate) errors.moveInDate = ["Move-in date is required"];
      if (Object.keys(errors).length) throw new ActionError("Please correct the highlighted fields.", errors);
    }

    let login: { where: { email?: string; phone?: string }; passwordHash: string } | null = null;
    if (input.createLogin) {
      const where = await resolveLoginIdentifier(input.loginIdentifier);
      const password = checkPassword(input.loginPassword);
      login = { where, passwordHash: await hashPassword(password) };
    }

    const student = await db.$transaction(
      async (tx) => {
        let userId: string | null = null;
        if (login) {
          const u = await tx.user.create({
            data: {
              name: input.fullName,
              ...login.where,
              passwordHash: login.passwordHash,
              role: "STUDENT",
              mustChangePassword: true,
              isActive: true,
            },
          });
          userId = u.id;
          await logActivity(tx, {
            userId: user.id,
            action: ACTIONS.USER_CREATED,
            entityType: "User",
            entityId: u.id,
            details: { name: u.name, role: "STUDENT", login: login.where.email ?? login.where.phone ?? null },
          });
        }
        const s = await tx.student.create({
          data: {
            userId,
            fullName: input.fullName,
            phone: input.phone,
            email: input.email,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            idNumber: input.idNumber,
            notes: input.notes,
            status: "PENDING",
            monthlyRent: round2(input.monthlyRent),
            rentDueDay: input.rentDueDay,
          },
        });
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.STUDENT_CREATED,
          entityType: "Student",
          entityId: s.id,
          details: {
            student: s.fullName,
            phone: s.phone,
            monthlyRent: round2(input.monthlyRent),
            rentDueDay: input.rentDueDay,
            checkIn: !input.savePending,
            login: !!login,
          },
        });
        if (!input.savePending) {
          await checkInStudent(
            {
              studentId: s.id,
              bedId: input.bedId!,
              startDate: input.moveInDate!,
              monthlyRent: input.monthlyRent,
              rentDueDay: input.rentDueDay,
            },
            user.id,
            tx,
          );
        }
        return s;
      },
      { timeout: 20_000 },
    );

    revalidateStudent(student.id);
    return {
      message: input.savePending ? `${student.fullName} saved as pending` : `${student.fullName} checked in`,
      data: { id: student.id },
    };
  },
);

// ───────── Edit ─────────

export const updateStudent = defineAction(
  { permission: "students.manage", schema: z.object({ id: zId(), ...personalFields, ...rentFields }) },
  async (input, user) => {
    const existing = await db.student.findUnique({
      where: { id: input.id },
      include: { activeAccommodation: { select: { id: true, monthlyRent: true } } },
    });
    if (!existing || existing.deletedAt) throw new ActionError("Student not found.");

    const next = {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      idNumber: input.idNumber,
      notes: input.notes,
      rentDueDay: input.rentDueDay,
    };
    const changes: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(next)) {
      const before = existing[k as keyof typeof next];
      if (before !== v) changes[k] = { from: before ?? null, to: v ?? null } as Prisma.InputJsonValue;
    }
    const newRent = round2(input.monthlyRent);
    const rentChanged = toNumber(existing.monthlyRent) !== newRent;
    if (rentChanged) changes.monthlyRent = { from: toNumber(existing.monthlyRent), to: newRent };

    if (Object.keys(changes).length === 0) return { message: "No changes to save" };

    await db.$transaction(async (tx) => {
      await tx.student.update({ where: { id: existing.id }, data: { ...next, monthlyRent: newRent } });
      // New rent applies to invoices generated from now on; existing invoices are unchanged.
      if (rentChanged && existing.activeAccommodation) {
        await tx.accommodation.update({ where: { id: existing.activeAccommodation.id }, data: { monthlyRent: newRent } });
      }
      if (existing.userId && existing.fullName !== input.fullName) {
        await tx.user.update({ where: { id: existing.userId }, data: { name: input.fullName } });
      }
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.STUDENT_UPDATED,
        entityType: "Student",
        entityId: existing.id,
        details: { student: input.fullName, changes },
      });
    });
    revalidateStudent(existing.id);
    return { message: "Student details saved" };
  },
);

// ───────── Check-in (existing student) ─────────

export const checkInExisting = defineAction(
  {
    permission: "students.manage",
    schema: z.object({
      id: zId(),
      bedId: z.string().trim().min(1, "Select a bed").max(64),
      moveInDate: zDate("Move-in date"),
      ...rentFields,
    }),
  },
  async (input, user) => {
    const s = await db.student.findUnique({ where: { id: input.id }, select: { status: true, deletedAt: true, fullName: true } });
    if (!s || s.deletedAt) throw new ActionError("Student not found.");
    if (s.status !== "PENDING" && s.status !== "CHECKED_OUT") {
      throw new ActionError("Only pending or checked-out students can be checked in.");
    }
    await checkInStudent(
      {
        studentId: input.id,
        bedId: input.bedId,
        startDate: input.moveInDate,
        monthlyRent: input.monthlyRent,
        rentDueDay: input.rentDueDay,
      },
      user.id,
    );
    revalidateStudent(input.id);
    return { message: `${s.fullName} checked in`, data: { id: input.id } };
  },
);

// ───────── Check-out ─────────

const checkOutSchema = z.object({
  id: zId(),
  moveOutDate: zDate("Move-out date"),
  notes: zOptText(1000),
  confirm: zCheckbox().refine((v) => v, "Please confirm the check-out"),
});

export const checkOut = defineAction(
  {
    permission: "students.manage",
    schema: checkOutSchema,
  },
  async (input, user) => {
    const { outstanding } = await checkOutStudent(
      { studentId: input.id, moveOutDate: input.moveOutDate, notes: input.notes },
      user.id,
    );
    revalidateStudent(input.id);
    return {
      message:
        `Checked out on ${formatDate(input.moveOutDate)}.` +
        (outstanding > 0 ? ` ${formatMoney(outstanding)} rent still outstanding.` : " No rent outstanding."),
      data: { id: input.id, outstanding },
    };
  },
);

// ───────── Change bed ─────────

export const changeStudentBed = defineAction(
  {
    permission: "students.manage",
    schema: z.object({ id: zId(), newBedId: z.string().trim().min(1, "Select a bed").max(64), effectiveDate: zDate("Effective date") }),
  },
  async (input, user) => {
    await changeBed({ studentId: input.id, newBedId: input.newBedId, effectiveDate: input.effectiveDate }, user.id);
    revalidateStudent(input.id);
    return { message: "Bed changed" };
  },
);

// ───────── Suspend / reactivate ─────────

export const setStudentStatus = defineAction(
  { permission: "students.manage", schema: z.object({ id: zId(), status: z.enum(["ACTIVE", "SUSPENDED"]) }) },
  async (input, user) => {
    const s = await db.student.findUnique({
      where: { id: input.id },
      include: { activeAccommodation: { select: { id: true } } },
    });
    if (!s || s.deletedAt) throw new ActionError("Student not found.");
    if (input.status === "SUSPENDED" && s.status !== "ACTIVE") {
      throw new ActionError("Only active students can be suspended.");
    }
    if (input.status === "ACTIVE") {
      if (s.status !== "SUSPENDED") throw new ActionError("Only suspended students can be reactivated.");
      if (!s.activeAccommodation) throw new ActionError("This student has no bed. Check them in instead.");
    }
    await db.student.update({ where: { id: s.id }, data: { status: input.status } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.STUDENT_STATUS_CHANGED,
      entityType: "Student",
      entityId: s.id,
      details: { student: s.fullName, from: s.status, to: input.status },
    });
    revalidateStudent(s.id);
    return { message: input.status === "SUSPENDED" ? `${s.fullName} suspended` : `${s.fullName} reactivated` };
  },
);

// ───────── Student login ─────────

export const createStudentLogin = defineAction(
  {
    permission: "students.manage",
    schema: z.object({ id: zId(), loginIdentifier: zOptText(200), loginPassword: z.string().max(128).optional() }),
  },
  async (input, user) => {
    const s = await db.student.findUnique({ where: { id: input.id } });
    if (!s || s.deletedAt) throw new ActionError("Student not found.");
    if (s.userId) throw new ActionError("This student already has a login.");
    const where = await resolveLoginIdentifier(input.loginIdentifier);
    const passwordHash = await hashPassword(checkPassword(input.loginPassword));
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: s.fullName,
          ...where,
          passwordHash,
          role: "STUDENT",
          mustChangePassword: true,
          // Checked-out students keep a disabled login until they are checked in again.
          isActive: s.status !== "CHECKED_OUT",
        },
      });
      await tx.student.update({ where: { id: s.id }, data: { userId: u.id } });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.USER_CREATED,
        entityType: "User",
        entityId: u.id,
        details: { name: u.name, role: "STUDENT", student: s.id, login: where.email ?? where.phone ?? null },
      });
    });
    revalidateStudent(s.id);
    return { message: "Login created. Share the temporary password with the student." };
  },
);

export const resetStudentPassword = defineAction(
  { permission: "students.manage", schema: z.object({ id: zId(), loginPassword: z.string().max(128).optional() }) },
  async (input, user) => {
    const s = await db.student.findUnique({ where: { id: input.id }, include: { user: { select: { id: true, role: true } } } });
    if (!s || s.deletedAt) throw new ActionError("Student not found.");
    if (!s.user || s.user.role !== "STUDENT") throw new ActionError("This student has no login yet.");
    const passwordHash = await hashPassword(checkPassword(input.loginPassword));
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: s.user!.id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId: s.user!.id } });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.USER_PASSWORD_RESET,
        entityType: "User",
        entityId: s.user!.id,
        details: { student: s.fullName },
      });
    });
    revalidateStudent(s.id);
    return { message: "Password reset. The student must change it at next sign-in." };
  },
);
