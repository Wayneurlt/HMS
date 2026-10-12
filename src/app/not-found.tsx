import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="text-center">
        <p className="text-sm text-accent-hi">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-2">The page you're looking for doesn't exist or was moved.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-hover">
          Back to home
        </Link>
      </div>
    </div>
  );
}
