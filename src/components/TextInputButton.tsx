/**
 * TextInputButton — Modal-based text input for QAM.
 *
 * Opens a modal window above the QAM panel so Steam's virtual keyboard
 * renders on top instead of behind it.
 */
import { useState } from "react";
import {
  showModal,
  ModalRoot,
  TextField,
  DialogButton,
  ButtonItem,
  Focusable,
} from "@decky/ui";

interface TextInputModalProps {
  label: string;
  initialValue: string;
  onSubmit: (value: string) => void;
  closeModal?: () => void;
}

function TextInputModal({
  label,
  initialValue,
  onSubmit,
  closeModal,
}: TextInputModalProps) {
  const [text, setText] = useState(initialValue);
  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <Focusable
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "12px",
        }}
      >
        <h3 style={{ margin: 0, color: "#dcdedf" }}>{label}</h3>
        <TextField
          value={text}
          onChange={(e: any) => setText(e?.target?.value ?? "")}
          focusOnMount={true}
        />
        <DialogButton
          onClick={() => {
            onSubmit(text);
            closeModal?.();
          }}
        >
          OK
        </DialogButton>
      </Focusable>
    </ModalRoot>
  );
}

interface TextInputButtonProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  disabled?: boolean;
}

export function TextInputButton({
  label,
  value,
  onChange,
  description,
  disabled,
}: TextInputButtonProps) {
  return (
    <ButtonItem
      layout="below"
      onClick={() =>
        showModal(
          <TextInputModal
            label={label}
            initialValue={value}
            onSubmit={onChange}
          />,
        )
      }
      disabled={disabled}
      description={
        description || (value ? `Current: ${value}` : "Tap to enter")
      }
    >
      {label}
    </ButtonItem>
  );
}
