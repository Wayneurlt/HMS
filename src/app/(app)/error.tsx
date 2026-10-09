"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg pt-16">
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Something went wrong loading this page"
        description={error.digest ? `Reference: ${error.digest}` : "Please try again."}
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
