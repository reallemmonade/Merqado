import { LiveSync } from "@/components/live/LiveSync";

/** Every case page stays live while open, in as many tabs and windows as people like. */
export default async function CaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <LiveSync engagementId={id} />
      {children}
    </>
  );
}
