import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold text-slate-900">Casa Companion</h1>
        <p className="mt-4 text-lg text-slate-600">
          A voice-first companion for kids. Safe, parent-controlled, and fun.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
        >
          Go to parent dashboard
        </Link>
      </div>
    </main>
  );
}
