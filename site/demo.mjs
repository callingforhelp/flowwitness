// Synthetic state model only: no network, browser replay, or product integration.
export const initialState = () => ({ release: 'v1', evidenceVersion: 'v1', status: 'verified' });
export function transition(state, action) {
  if (action === 'reset') return initialState();
  if (action === 'release-v2') return { ...state, release: 'v2', status: state.evidenceVersion === 'v2' && state.status === 'verified' ? 'verified' : 'stale' };
  if (action === 'fail') return { ...state, status: 'unavailable' };
  if (action === 'approve-and-pass') return { ...state, evidenceVersion: state.release, status: 'verified' };
  return state;
}
export function answer(state, question, role) {
  const q = question.trim().toLowerCase().replace(/[?？.!。！]/g, '').trim();
  const known = ['how do i export a report', 'export report', 'export', '如何导出报告', '导出报告', '怎么导出报告'];
  if (!known.includes(q)) return { kind: 'clarify', steps: [] };
  if (role !== 'admin') return { kind: 'role', steps: [] };
  if (state.status !== 'verified' || state.evidenceVersion !== state.release) return { kind: 'unavailable', steps: [] };
  return { kind: 'verified', version: state.release, steps: state.release === 'v1' ? ['project', 'data', 'export'] : ['project', 'data', 'menu', 'export'] };
}
