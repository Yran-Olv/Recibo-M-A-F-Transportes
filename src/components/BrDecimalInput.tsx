import React from "react";
import {
  finalizeBrDecimal,
  sanitizeBrDecimalTyping,
} from "../utils/brDecimal";
import { inputClass } from "../styles/forms";

interface BrDecimalInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Casas decimais (peso/qtd e valores R$: 2) */
  decimals?: number;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

export function BrDecimalInput({
  value,
  onChange,
  decimals = 2,
  className,
  placeholder,
  readOnly = false,
}: BrDecimalInputProps) {
  const cls = className || inputClass;

  if (readOnly) {
    return (
      <input
        type="text"
        readOnly
        className={cls}
        value={value}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cls}
      value={value}
      placeholder={placeholder ?? (decimals === 3 ? "0,000" : "0,00")}
      onChange={(e) => onChange(sanitizeBrDecimalTyping(e.target.value, decimals))}
      onBlur={() => {
        if (!value.trim()) return;
        onChange(finalizeBrDecimal(value, decimals));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
