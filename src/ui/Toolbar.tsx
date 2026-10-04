import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../game/materials';

interface ToolbarProps {
  material: MaterialId;
  canUndo: boolean;
  canRedo: boolean;
  onMaterialChange: (material: MaterialId) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Material picker plus undo, redo and play. Two groups, so CSS can put them
 * in one bottom bar (portrait) or in columns on each side (landscape).
 */
export function Toolbar({
  material,
  canUndo,
  canRedo,
  onMaterialChange,
  onUndo,
  onRedo,
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
            onClick={() => onMaterialChange(id)}
          >
            <span className="material-swatch" />
            {MATERIALS[id].label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button type="button" className="toolbar-button" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="toolbar-button" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
        {/* Starts the simulation once physics exists (phase 2). */}
        <button type="button" className="toolbar-button" disabled>
          Play
        </button>
      </div>
    </div>
  );
}
