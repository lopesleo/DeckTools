import { ButtonItem } from "@decky/ui";
import { CSSProperties } from "react";

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  description?: string;
  variant?: "primary" | "danger" | "default";
}

export function ActionButton({
  label,
  onClick,
  disabled,
  description,
  variant = "default",
}: ActionButtonProps) {
  const labelStyle: CSSProperties = {};

  if (variant === "danger") {
    labelStyle.color = "#ff4444";
  } else if (variant === "primary") {
    labelStyle.color = "#1a9fff";
  }

  return (
    <ButtonItem
      layout="below"
      onClick={onClick}
      disabled={disabled}
      description={description}
    >
      <span style={labelStyle}>{label}</span>
    </ButtonItem>
  );
}
