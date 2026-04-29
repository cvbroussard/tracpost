"use client";

import { useState } from "react";
import {
  ThinProgressBar,
  ValidationHint,
  SectionCard,
  ReviewSlot,
  RadioCardGroup,
  DateSegmented,
  PhoneE164Field,
  TagChipInput,
  ChipMultiSelect,
  SupportChat,
} from "@/components/forms";

export default function FormsPreview() {
  const [progress, setProgress] = useState(35);
  const [phone, setPhone] = useState("");
  const [tags, setTags] = useState<string[]>(["United States"]);
  const [funding, setFunding] = useState<string | null>("revenue");
  const [uses, setUses] = useState<string[]>(["Operating expenses", "Paying suppliers"]);
  const [accountUses, setAccountUses] = useState<string[]>(["operating", "paying", "receiving"]);
  const [date, setDate] = useState({ month: "", day: "", year: "" });

  return (
    <main style={{ background: "#f7f7f5", minHeight: "100vh", paddingBottom: 120 }}>
      <ThinProgressBar percent={progress} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px 40px" }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111", margin: 0, marginBottom: 6 }}>
            Form primitives — preview
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Visual verification of Mercury-style components in <code>src/components/forms/</code>.
          </p>
        </header>

        <Block title="ThinProgressBar (top of viewport)">
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            Currently at {progress}%. Drag to test.
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </Block>

        <Block title="SectionCard with status pill + footer">
          <SectionCard
            title="Carlos Broussard"
            status="incomplete"
            onSave={() => alert("save")}
            onCancel={() => alert("cancel")}
          >
            <Field label="What's your citizenship status in the US?">
              <RadioCardGroup
                options={[
                  { value: "us", label: "US Citizen" },
                  { value: "perm", label: "Permanent resident" },
                  { value: "other", label: "Other" },
                ]}
                value={"us"}
                onChange={() => {}}
              />
            </Field>
            <Field label="What's your birthday?" hint="You must be 18 or older.">
              <DateSegmented value={date} onChange={setDate} />
            </Field>
          </SectionCard>
        </Block>

        <Block title="PhoneE164Field (E.164 with flag dropdown)">
          <Field label="Phone number">
            <PhoneE164Field value={phone} onChange={setPhone} />
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Stored: <code>{phone || "(empty)"}</code>
            </p>
          </Field>
        </Block>

        <Block title="TagChipInput (freeform with autocomplete)">
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            For freeform vocabularies — users can type their own values. Suggestions appear as a
            floating popover.
          </p>
          <Field label="Tags">
            <TagChipInput
              values={tags}
              onChange={setTags}
              suggestions={["renovation", "kitchen remodel", "bathroom", "hardscape", "deck", "landscape"]}
              placeholder="Type and press Enter, or pick a suggestion"
            />
          </Field>
        </Block>

        <Block title="ChipMultiSelect (constrained, flush dropdown — Mercury pattern)">
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            For closed vocabularies — countries, account uses, platforms. Click into the field;
            dropdown extends below as one continuous control. All options visible, click row to
            toggle. Selected items show as chips above AND checked rows below.
          </p>
          <Field label="How do you plan to use your account?">
            <ChipMultiSelect
              values={accountUses}
              onChange={setAccountUses}
              options={[
                { value: "operating", label: "Operating expenses" },
                { value: "investors", label: "Receiving funds from investors" },
                { value: "paying", label: "Paying suppliers" },
                { value: "receiving", label: "Receiving revenue" },
                { value: "credit", label: "Credit cards" },
                { value: "wires", label: "Sending wires" },
                { value: "treasury", label: "Treasury management" },
                { value: "fx", label: "Currency exchange" },
                { value: "payroll", label: "Payroll" },
                { value: "tax", label: "Tax payments" },
              ]}
              placeholder="Select account uses"
            />
          </Field>
        </Block>

        <Block title="RadioCardGroup — single + multi">
          <Field label="Where will your first deposits come from?">
            <RadioCardGroup
              options={[
                { value: "investors", label: "Investors" },
                { value: "revenue", label: "Revenue" },
                { value: "self", label: "Self" },
              ]}
              value={funding}
              onChange={setFunding}
            />
          </Field>
          <Field label="How do you plan to use your account?">
            <RadioCardGroup
              multiple
              values={uses}
              onMultiChange={setUses}
              options={[
                { value: "Operating expenses", label: "Operating expenses" },
                { value: "Paying suppliers", label: "Paying suppliers" },
                { value: "Receiving revenue", label: "Receiving revenue" },
                { value: "Payroll", label: "Payroll" },
              ]}
              value={null}
              onChange={() => {}}
              layout="column"
            />
          </Field>
        </Block>

        <Block title="ValidationHint — soft pink, not aggressive red">
          <Field label="Social security number">
            <input
              type="text"
              defaultValue=""
              placeholder="123-45-6789"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 15,
                border: "1px solid #ef4444",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#1a1a1a",
              }}
            />
            <ValidationHint message="Please submit a valid 9-digit SSN" />
          </Field>
        </Block>

        <Block title='ReviewSlot ("Almost done" review checklist)'>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
            Numbered slots reveal scope only at the end. Click to jump back into a section.
          </p>
          <ReviewSlot index={1} total={5} label="Company info" status="incomplete" hint="Missing: registered address" onClick={() => alert("jump to 1")} />
          <ReviewSlot index={2} total={5} label="Owner identity" status="complete" />
          <ReviewSlot index={3} total={5} label="Ownership details" status="incomplete" onClick={() => alert("jump to 3")} />
          <ReviewSlot index={4} total={5} label="Company documents" status="in_progress" hint="2 of 3 uploaded" onClick={() => alert("jump to 4")} />
          <ReviewSlot index={5} total={5} label="Tax info" status="optional" />
        </Block>

        <Block title="SupportChat (LLM-backed, bottom-right)">
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Look for the &quot;Need help?&quot; bubble at the bottom-right of the screen. Click to open
            and chat with the TracPost assistant. Powered by Claude Haiku 4.5 via{" "}
            <code>/api/support-chat</code>.
          </p>
        </Block>
      </div>

      <SupportChat context="signup" />
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>{hint}</p>}
      {children}
    </div>
  );
}
