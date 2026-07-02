'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

function ToolbarButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${
        active ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Uncontrolled rich text editor that mirrors its HTML into a hidden input,
 * so it drops into plain `<form action={serverAction}>` submissions without
 * needing react-hook-form. To push new content in from outside (e.g.
 * "Carregar modelo"), remount with a different `key` + `initialContent`.
 */
export function RichTextEditor({
  name,
  initialContent = '',
}: {
  name: string;
  initialContent?: string;
}) {
  const [html, setHtml] = useState(initialContent);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[120px] rounded-b border border-t-0 border-gray-300 px-3 py-2 text-sm focus:outline-none',
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div>
      <div className="flex gap-1 rounded-t border border-gray-300 bg-gray-50 p-1">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          Negrito
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Itálico
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Lista
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Lista numerada
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}
