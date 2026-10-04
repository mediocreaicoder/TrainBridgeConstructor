import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../game/materials';

interface ToolbarProps {
  material: MaterialId;
  /** True while the vehicle is running: editing is locked and Play becomes Stop. */
  running: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onMaterialChange: (material: MaterialId) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * Material picker plus undo, redo, zoom and play/stop. Two groups, so CSS can
 * stack them along the bottom (portrait) or put them in columns on each side
 * (landscape).
 */
export function Toolbar({
  material,
  running,
  canUndo,
  canRedo,
  canZoomIn,
  canZoomOut,
  onMaterialChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onPlay,
  onStop,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-group" role="radiogroup" aria-label="Material">
        {MATERIAL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === material}
            className={`toolbar-button material-${id}`}
            disabled={running}
            onClick={() => onMaterialChange(id)}
          >
            <span className="material-swatch" />
            {MATERIALS[id].label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          className="toolbar-button"
          disabled={running || !canUndo}
          onClick={onUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={running || !canRedo}
          onClick={onRedo}
        >
          Redo
        </button>
        <button
          type="button"
          className="toolbar-button toolbar-icon"
          aria-label="Zoom out"
          disabled={!canZoomOut}
          onClick={onZoomOut}
        >
          -
        </button>
        <button
          type="button"
          className="toolbar-button toolbar-icon"
          aria-label="Zoom in"
          disabled={!canZoomIn}
          onClick={onZoomIn}
        >
          +
        </button>
        <button
          type="button"
          className={`toolbar-button ${running ? 'toolbar-stop' : 'toolbar-play'}`}
          onClick={running ? onStop : onPlay}
        >
          {running ? 'Stop' : 'Play'}
        </button>
      </div>
    </div>
  );
}
