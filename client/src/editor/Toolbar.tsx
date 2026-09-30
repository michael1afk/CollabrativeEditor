import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor;
}

export function Toolbar({ editor }: ToolbarProps) {
  // Tiptap v3 does not re-render React on every transaction, so active state is
  // read through a selector that re-renders only when one of these flips.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bulletList: e.isActive('bulletList'),
      codeBlock: e.isActive('codeBlock'),
    }),
  });

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarButton
        label="Bold"
        isActive={active.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>

      <ToolbarButton
        label="Italic"
        isActive={active.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>

      <span className="toolbar-divider" aria-hidden="true" />

      <ToolbarButton
        label="Heading 1"
        isActive={active.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        label="Heading 2"
        isActive={active.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>

      <span className="toolbar-divider" aria-hidden="true" />

      <ToolbarButton
        label="Bullet list"
        isActive={active.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        &bull; List
      </ToolbarButton>

      <ToolbarButton
        label="Code block"
        isActive={active.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {'</>'}
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ label, isActive, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={isActive ? 'toolbar-button is-active' : 'toolbar-button'}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
    >
      {children}
    </button>
  );
}
