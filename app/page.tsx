import ComparisonForm from "@/components/ComparisonForm";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          New comparison
        </h1>
        <p className="max-w-2xl text-muted">
          Capture SEO metadata or dataLayer events from two sites and diff
          them side by side.
        </p>
      </div>
      <div className="animate-fade-up animate-fade-up-2">
        <ComparisonForm />
      </div>
    </div>
  );
}
