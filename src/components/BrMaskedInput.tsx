import React from "react";
import { BrDocMask, formatByMask } from "../utils/cnpj";
import { inputClass } from "../styles/forms";

interface BrMaskedInputProps {
  mask: BrDocMask;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  required?: boolean;
  autoComplete?: string;
  readOnly?: boolean;
}

export function BrMaskedInput({
  mask,
  value,
  onChange,
  className,
  placeholder,
  name,
  id,
  required,
  autoComplete = "off",
  readOnly = false,
}: BrMaskedInputProps) {
  const cls = className || inputClass;
  const inputMode = mask === "placa" ? "text" : "numeric";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatByMask(mask, e.target.value));
  };

  const handleBlur = () => {
    if (value.trim()) onChange(formatByMask(mask, value));
  };

  return (
    <input
      type="text"
      name={name}
      id={id}
      required={required}
      readOnly={readOnly}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      className={cls}
    />
  );
}
