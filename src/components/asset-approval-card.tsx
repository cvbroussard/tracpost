"use client";

/**
 * Asset approval card — surfaces brand promotions for subscriber review
 * before commit.
 *
 * After the 2026-05-18 cascade-vs-deliberate split, brands are the only
 * cascade-surfaced entity that supports promotion:
 *   - GBP-canonical entities (service areas, categories) match against
 *     the subscriber's existing Google catalog, never author new ones
 *   - Projects became deliberate upload-time buckets, retired from the
 *     cascade entirely
 *   - Personas + branches haven't entered the cascade yet
 *
 * Defaults to all-UNCHECKED (per 2026-05-18). The autopilot endgame UX
 * is explicit one-tap approval (push notification → click); the desktop
 * card mirrors that posture. Subscriber must consciously check each
 * suggestion — prevents silent promotion of NER hallucinations.
 *
 * State is controlled by the parent. Renders nothing when there are no
 * suggestions.
 */

export interface BrandSuggestion {
  /** NER text exactly as caught — used as both display + DB name. */
  name: string;
  context?: string;
}

export interface ApprovalSelection {
  /** Brand names the subscriber has checked for promotion. */
  brands_to_create: BrandSuggestion[];
}

interface Props {
  brandSuggestions: BrandSuggestion[];
  value: ApprovalSelection;
  onChange: (next: ApprovalSelection) => void;
  disabled?: boolean;
}

export function AssetApprovalCard({
  brandSuggestions,
  value,
  onChange,
  disabled,
}: Props) {
  if (brandSuggestions.length === 0) return null;

  const checkedBrandNames = new Set(value.brands_to_create.map((b) => b.name));

  function toggleBrand(b: BrandSuggestion) {
    if (checkedBrandNames.has(b.name)) {
      onChange({
        ...value,
        brands_to_create: value.brands_to_create.filter((x) => x.name !== b.name),
      });
    } else {
      onChange({
        ...value,
        brands_to_create: [...value.brands_to_create, b],
      });
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <h4 className="mb-2 text-xs font-semibold text-accent">
        Approve suggestions
      </h4>

      <section>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          New brands
        </div>
        <ul className="space-y-1.5">
          {brandSuggestions.map((b) => {
            const checked = checkedBrandNames.has(b.name);
            return (
              <li key={b.name} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBrand(b)}
                  disabled={disabled}
                  className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
                  id={`brand-${b.name}`}
                />
                <label
                  htmlFor={`brand-${b.name}`}
                  className="flex-1 cursor-pointer text-xs"
                >
                  <span className="font-medium">{b.name}</span>
                  {b.context && (
                    <span className="ml-2 text-[10px] italic text-muted">
                      “…{b.context}…”
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
