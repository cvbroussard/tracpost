"use client";

import PhoneInputWithCountry from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import type { E164Number } from "libphonenumber-js";
import { useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: Country;
  placeholder?: string;
  error?: boolean;
  ariaLabel?: string;
}

export function PhoneE164Field({
  value,
  onChange,
  defaultCountry = "US",
  placeholder = "(412) 555-1234",
  error,
  ariaLabel = "Phone number",
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <>
      <div
        className="tp-phone-wrap"
        data-error={error ? "true" : "false"}
        data-focus={focused ? "true" : "false"}
      >
        <PhoneInputWithCountry
          international
          countryCallingCodeEditable={false}
          defaultCountry={defaultCountry}
          value={(value as E164Number) || undefined}
          onChange={(v) => onChange(v || "")}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      <style>{`
        .tp-phone-wrap {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          border: 1px solid #c5cbd3;
          border-radius: 8px;
          background: #f9fafb;
          transition: border-color 150ms, background 150ms;
        }
        .tp-phone-wrap[data-focus="true"] {
          border-color: #1a1a1a;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(26,26,26,0.06);
        }
        .tp-phone-wrap[data-error="true"] {
          border-color: #ef4444;
          background: #fef2f2;
        }
        .tp-phone-wrap[data-error="true"][data-focus="true"] {
          box-shadow: 0 0 0 3px rgba(239,68,68,0.08);
        }
        .tp-phone-wrap .PhoneInput {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tp-phone-wrap .PhoneInputCountry {
          margin-right: 0;
          padding-right: 10px;
          border-right: 1px solid rgba(0,0,0,0.08);
          align-self: stretch;
          display: flex;
          align-items: center;
        }
        .tp-phone-wrap .PhoneInputCountrySelect {
          cursor: pointer;
        }
        .tp-phone-wrap .PhoneInputCountryIcon {
          width: 22px;
          height: 16px;
          box-shadow: none;
          background: transparent;
        }
        .tp-phone-wrap .PhoneInputCountryIcon--border {
          box-shadow: none;
        }
        .tp-phone-wrap .PhoneInputCountrySelectArrow {
          margin-left: 6px;
          opacity: 0.5;
          color: #6b7280;
          width: 6px;
          height: 6px;
        }
        .tp-phone-wrap .PhoneInputInput {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 15px;
          color: #1a1a1a;
          padding: 0;
          font-family: inherit;
        }
        .tp-phone-wrap .PhoneInputInput::placeholder {
          color: #b0b8c4;
        }
      `}</style>
    </>
  );
}
