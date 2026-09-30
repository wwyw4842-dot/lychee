"use client"

import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { EditorState, SerializedEditorState } from "lexical"

import { editorTheme } from "@/components/editor/themes/editor-theme"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"

const editorConfig: InitialConfigType = {
  namespace: "Editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error(error)
  },
}

export { sanitizeSerializedState } from "./migrate-state"
import { sanitizeSerializedState } from "./migrate-state"

export function Editor({
  documentId,
  tabId,
  activeTabId,
  isActive,
  editorSerializedState,
  onEditorStateChange,
  initialTitle,
  onTitleChange,
}: {
  documentId: string
  tabId: string
  /** The currently active tabId for this document (changes on tab switch). */
  activeTabId: string | null
  isActive: boolean
  editorSerializedState?: SerializedEditorState
  onEditorStateChange?: (editorState: EditorState) => void
  initialTitle?: string
  onTitleChange?: (title: string) => void
}) {
  const initialState = (() => {
    if (editorSerializedState == null) return undefined
    const sanitized = sanitizeSerializedState(editorSerializedState)
    if (sanitized == null) return undefined
    return JSON.stringify(sanitized)
  })()

  return (
    <div className="bg-background overflow-hidden">
      <LexicalComposer
        initialConfig={{
          ...editorConfig,
          ...(initialState != null ? { editorState: initialState } : {}),
        }}
      >
        <Plugins
          documentId={documentId}
          tabId={tabId}
          activeTabId={activeTabId}
          isActive={isActive}
          initialTitle={initialTitle}
          onTitleChange={onTitleChange}
        />

        <OnChangePlugin
          ignoreSelectionChange={true}
          onChange={(editorState: EditorState) => {
            onEditorStateChange?.(editorState)
          }}
        />
      </LexicalComposer>
    </div>
  )
}
