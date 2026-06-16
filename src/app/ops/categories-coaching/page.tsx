"use client";
import { useState } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { CategoriesCoachingClient } from "./coaching-client";
import { ServicesClient } from "./services-client";

type Tab = "categories" | "services";

export default function Page() {
  const [tab, setTab] = useState<Tab>("categories");

  return (
    <ManagePage title="Categories & Services" requireSite>
      {({ siteId }) => (
        <div>
          <div className="border-b border-border px-4">
            <div className="flex gap-1">
              <TabButton active={tab === "categories"} onClick={() => setTab("categories")}>
                Business Categories
              </TabButton>
              <TabButton active={tab === "services"} onClick={() => setTab("services")}>
                Services
              </TabButton>
            </div>
          </div>
          {tab === "categories" ? (
            <CategoriesCoachingClient siteId={siteId} />
          ) : (
            <ServicesClient siteId={siteId} />
          )}
        </div>
      )}
    </ManagePage>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
