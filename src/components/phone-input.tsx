"use client";

import PhoneInput from "react-phone-number-input/input";
import type { E164Number } from "libphonenumber-js";

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * E.164 phone input with country-aware formatting.
 * Defaults to US (+1). Stores value as E.164 string (e.g. +14125551234).
 */
export function PhoneField({ value, onChange, placeholder = "+1 (412) 555-1234", className = "", style }: PhoneFieldProps) {
  return (
    <PhoneInput
      country="US"
      international
      withCountryCallingCode
      value={(value as E164Number) || ""}
      onChange={(v) => onChange(v || "")}
      placeholder={placeholder}
      className={className}
      style={style}
    />
  );
}
