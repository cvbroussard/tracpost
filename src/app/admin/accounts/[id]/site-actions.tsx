"use client";

interface SiteActionsProps {
  siteId: string;
  siteName: string;
  isActive: boolean;
}

export function SiteActions({ siteId, siteName, isActive }: SiteActionsProps) {
  // Admin view only — activation/deactivation is tenant-controlled via Settings
  return (
    <span className={`text-xs ${isActive ? "text-success" : "text-muted"}`}>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
