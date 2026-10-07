import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../game/materials';
import { VEHICLES, type VehicleId } from '../game/train';
import { PixelIcon } from './PixelIcon';
import { Stars } from './Stars';

interface ToolbarProps {
  material: MaterialId;
  /** The train the next run sends across. */
  train: VehicleId;
  /** True while a train is running: editing is locked and Play becomes Stop. */
  running: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onMaterialChange: (material: MaterialId) => void;
  /** Switches to the next train (and from the heaviest back to the handcar). */
  onNextTrain: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * Material picker plus undo, redo, zoom, train and play/stop. Two groups, so
 * CSS can stack them along the bottom (portrait) or put them in columns on
 * each side (landscape).
 */
export function Toolbar({
  material,
  train,
  running,
  canUndo,
  canRedo,
  canZoomIn,
  canZoomOut,
  onMaterialChange,
  onNextTrain,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onPlay,
  onStop,
}: ToolbarProps) {
  const trainSpec = VEHICLES[train];
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
          aria-label="Undo"
          title="Undo"
          disabled={running || !canUndo}
          onClick={onUndo}
        >
          <PixelIcon name="undo" />
        </button>
        <button
          type="button"
          className="toolbar-button"
          aria-label="Redo"
          title="Redo"
          disabled={running || !canRedo}
          onClick={onRedo}
        >
          <PixelIcon name="redo" />
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
          className="toolbar-button toolbar-train"
          aria-label={`Train: ${trainSpec.name}. Tap to change`}
          disabled={running}
          onClick={onNextTrain}
        >
          {trainSpec.label}
          <Stars count={trainSpec.stars} />
        </button>
        <button
          type="button"
          className={`toolbar-button ${running ? 'toolbar-stop' : 'toolbar-play'}`}
          aria-label={running ? 'Stop' : 'Play'}
          title={running ? 'Stop' : 'Play'}
          onClick={running ? onStop : onPlay}
        >
          <PixelIcon name={running ? 'stop' : 'play'} />
        </button>
      </div>
    </div>
  );
}
