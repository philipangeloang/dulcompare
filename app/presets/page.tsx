import PresetEditor from "@/components/PresetEditor";

export default function PresetsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Presets</h1>
        <p className="max-w-2xl text-muted">Edit the page sets comparisons run over.</p>
      </div>
      <PresetEditor />
    </div>
  );
}
