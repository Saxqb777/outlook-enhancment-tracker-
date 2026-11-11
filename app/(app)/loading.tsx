export default function Loading() {
  return (
    <div className="page-in skel" aria-busy="true" aria-label="Loading">
      <div className="skel-h" />
      <div className="skel-row">
        <div className="skel-card" />
        <div className="skel-card" />
        <div className="skel-card" />
      </div>
      <div className="skel-panel" />
      <div className="skel-panel short" />
    </div>
  );
}
