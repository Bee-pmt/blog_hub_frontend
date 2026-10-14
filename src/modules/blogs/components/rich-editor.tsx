"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { httpUrl } from "@/lib/utils";

type RichEditorProps = {
  content: string;
  onChange: (content: string) => void;
  disabled: boolean;
};

export default function RichEditor({
  content,
  onChange,
  disabled,
}: RichEditorProps) {
  const [insert, setInsert] = useState<"link" | "image" | null>(null);
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      Markdown,
      Image,
    ],
    content,
    contentType: "markdown",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Story content",
        "aria-multiline": "true",
        class: "prose visual-editor",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  if (!editor) return <p role="status">Preparing the editor…</p>;
  const buttons = [
    {
      label: "Bold",
      active: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      active: editor.isActive("italic"),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Heading 2",
      active: editor.isActive("heading", { level: 2 }),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      active: editor.isActive("heading", { level: 3 }),
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bullets",
      active: editor.isActive("bulletList"),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      active: editor.isActive("orderedList"),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      active: editor.isActive("blockquote"),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Inline code",
      active: editor.isActive("code"),
      action: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Code block",
      active: editor.isActive("codeBlock"),
      action: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Divider",
      active: false,
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      label: "Undo",
      active: false,
      action: () => editor.chain().focus().undo().run(),
    },
    {
      label: "Redo",
      active: false,
      action: () => editor.chain().focus().redo().run(),
    },
  ];
  return (
    <div className="rich-editor">
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Story formatting"
      >
        {buttons.map((button) => (
          <button
            type="button"
            key={button.label}
            aria-pressed={button.active}
            disabled={disabled}
            onClick={button.action}
          >
            {button.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setInsert("link");
            setError("");
          }}
        >
          Link
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          Remove link
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setInsert("image");
            setError("");
          }}
        >
          Image
        </button>
      </div>
      {insert && (
        <form
          className="insert-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const url = String(values.get("url") || "").trim();
            if (!httpUrl(url) || url.length > 2048) {
              setError("Use an HTTP or HTTPS URL of up to 2,048 characters.");
              return;
            }
            if (insert === "link")
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
            else
              editor
                .chain()
                .focus()
                .setImage({ src: url, alt: String(values.get("alt") || "") })
                .run();
            setInsert(null);
          }}
        >
          <label>
            {insert === "link" ? "Link URL" : "Image URL"}
            <input
              className="form-control"
              type="url"
              name="url"
              required
              autoFocus
            />
          </label>
          {insert === "image" && (
            <label>
              Alternative text
              <input
                className="form-control"
                name="alt"
                required
                maxLength={500}
              />
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="button button-secondary" disabled={disabled}>
            Insert
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => setInsert(null)}
          >
            Cancel
          </button>
        </form>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
