export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        AI Outreach Control Panel — LandJet Growth Engine
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <a
          href="/campaigns"
          className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
        >
          <p className="text-sm font-medium text-gray-500">Campaigns</p>
          <p className="mt-1 text-lg font-semibold">Manage outreach</p>
        </a>
        <a
          href="/drafts"
          className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
        >
          <p className="text-sm font-medium text-gray-500">Drafts</p>
          <p className="mt-1 text-lg font-semibold">Review AI emails</p>
        </a>
        <a
          href="/activity"
          className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
        >
          <p className="text-sm font-medium text-gray-500">Activity</p>
          <p className="mt-1 text-lg font-semibold">System status</p>
        </a>
      </div>
    </div>
  );
}
