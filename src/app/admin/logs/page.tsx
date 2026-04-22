import { Suspense } from "react";
import { LogsClient } from "./logs-client";

export const dynamic = "force-dynamic";

export default function LogsPage() {
  return (
    <Suspense>
      <LogsClient />
    </Suspense>
  );
}
