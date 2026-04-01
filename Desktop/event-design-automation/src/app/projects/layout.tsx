import { ReactNode } from "react";
import { requireUserForPage } from "@/lib/auth";

export default async function ProjectsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUserForPage();
  return <>{children}</>;
}
