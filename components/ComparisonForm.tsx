"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Preset, Suite } from "@/lib/types";
import { suiteLabel } from "@/lib/labels";

const SUITES: { value: Suite; label: string }[] = [
  { value: "seo", label: suiteLabel("seo") },
  { value: "datalayer", label: suiteLabel("datalayer") },
];

function isValidBaseUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function SiteFields({
  id,
  title,
  labelValue,
  onLabelChange,
  urlValue,
  onUrlChange,
  urlTouched,
  onUrlBlur,
  urlValid,
  labelPlaceholder,
  urlPlaceholder,
}: {
  id: string;
  title: string;
  labelValue: string;
  onLabelChange: (value: string) => void;
  urlValue: string;
  onUrlChange: (value: string) => void;
  urlTouched: boolean;
  onUrlBlur: () => void;
  urlValid: boolean;
  labelPlaceholder: string;
  urlPlaceholder: string;
}) {
  const showHint = urlTouched && urlValue !== "" && !urlValid;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-label`}
          className="text-xs font-medium tracking-wide text-muted uppercase"
        >
          Label
        </label>
        <input
          id={`${id}-label`}
          className="input"
          value={labelValue}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={labelPlaceholder}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-url`}
          className="text-xs font-medium tracking-wide text-muted uppercase"
        >
          Base URL
        </label>
        <input
          id={`${id}-url`}
          className={`input font-mono ${showHint ? "input-invalid" : ""}`}
          value={urlValue}
          onChange={(e) => onUrlChange(e.target.value)}
          onBlur={onUrlBlur}
          placeholder={urlPlaceholder}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        {showHint && (
          <p className="text-xs text-warn">
            Enter a full http(s) URL, e.g. {urlPlaceholder}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ComparisonForm() {
  const router = useRouter();

  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const [suite, setSuite] = useState<Suite>("seo");
  const [presetId, setPresetId] = useState("");

  const [siteALabel, setSiteALabel] = useState("");
  const [siteABaseURL, setSiteABaseURL] = useState("");
  const [siteBLabel, setSiteBLabel] = useState("");
  const [siteBBaseURL, setSiteBBaseURL] = useState("");

  const [urlATouched, setUrlATouched] = useState(false);
  const [urlBTouched, setUrlBTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/presets")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load presets (${res.status})`);
        return res.json() as Promise<Preset[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setPresets(data);
        const first = data.find((p) => p.suite === "seo");
        setPresetId(first?.id ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPresetsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPresets = useMemo(
    () => (presets ?? []).filter((p) => p.suite === suite),
    [presets, suite],
  );
  const selectedPreset = filteredPresets.find((p) => p.id === presetId);

  function handleSuiteChange(next: Suite) {
    if (next === suite) return;
    setSuite(next);
    const first = (presets ?? []).find((p) => p.suite === next);
    setPresetId(first?.id ?? "");
  }

  const urlAValid = isValidBaseUrl(siteABaseURL);
  const urlBValid = isValidBaseUrl(siteBBaseURL);
  const canSubmit =
    urlAValid &&
    urlBValid &&
    siteALabel.trim() !== "" &&
    siteBLabel.trim() !== "" &&
    presetId !== "" &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUrlATouched(true);
    setUrlBTouched(true);
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suite,
          siteA: { label: siteALabel.trim(), baseURL: siteABaseURL.trim() },
          siteB: { label: siteBLabel.trim(), baseURL: siteBBaseURL.trim() },
          presetId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(data?.error ?? "Failed to start comparison.");
        setSubmitting(false);
        return;
      }
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">Sites to compare</h2>
          <p className="mt-1 text-sm text-muted">
            Enter two base URLs, choose a suite, and pick a page preset.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
          {SUITES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSuiteChange(s.value)}
              aria-pressed={suite === s.value}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                suite === s.value
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <SiteFields
          id="site-a"
          title="Site A"
          labelValue={siteALabel}
          onLabelChange={setSiteALabel}
          urlValue={siteABaseURL}
          onUrlChange={setSiteABaseURL}
          urlTouched={urlATouched}
          onUrlBlur={() => setUrlATouched(true)}
          urlValid={urlAValid}
          labelPlaceholder="Production"
          urlPlaceholder="https://www.dulcolax.com/en-us/"
        />

        <div className="relative hidden md:flex md:items-center md:justify-center">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
          <span className="relative bg-surface px-2 font-display text-sm text-faint italic">
            vs
          </span>
        </div>

        <SiteFields
          id="site-b"
          title="Site B"
          labelValue={siteBLabel}
          onLabelChange={setSiteBLabel}
          urlValue={siteBBaseURL}
          onUrlChange={setSiteBBaseURL}
          urlTouched={urlBTouched}
          onUrlBlur={() => setUrlBTouched(true)}
          urlValid={urlBValid}
          labelPlaceholder="Staging"
          urlPlaceholder="https://preview.mon-uat.mgn.opellahealth.com/en-us/dulcolax/us/"
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label
          htmlFor="preset"
          className="text-xs font-medium tracking-wide text-muted uppercase"
        >
          Preset
        </label>
        <div className="flex items-center gap-3">
          <select
            id="preset"
            className="input"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            disabled={filteredPresets.length === 0}
          >
            {filteredPresets.length === 0 && (
              <option value="">No presets for this suite</option>
            )}
            {filteredPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selectedPreset && (
            <span className="stat shrink-0 text-sm text-muted">
              {selectedPreset.pages.length} pages
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-6">
        <div className="min-h-[1.25rem] text-sm text-warn">
          {submitError ?? presetsError}
        </div>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {submitting ? "Starting…" : "Run comparison"}
        </button>
      </div>
    </form>
  );
}
