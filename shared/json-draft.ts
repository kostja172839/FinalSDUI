export interface JsonDraftState {
  base: string;
  text: string;
}
export function syncJsonDraft(state: JsonDraftState, incoming: string): JsonDraftState {
  return state.text === state.base || state.text === incoming ? { base: incoming, text: incoming } : state;
}
export function editJsonDraft(state: JsonDraftState, incoming: string, text: string): JsonDraftState {
  return { base: state.text === state.base ? incoming : state.base, text };
}
export function jsonDraftStatus(state: JsonDraftState, incoming: string) {
  return {
    dirty: state.text !== incoming,
    conflict: state.text !== state.base && state.base !== incoming && state.text !== incoming,
  };
}
