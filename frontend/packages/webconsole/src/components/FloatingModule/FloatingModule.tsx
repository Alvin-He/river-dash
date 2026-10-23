import type { CSSProperties, ReactNode } from "react";
import { Rnd } from "react-rnd";

export interface ModulePosition {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface FloatingModuleProps {
	children: ReactNode;
	position: ModulePosition;
	minHeight?: number;
	minWidth?: number;
	isLocked?: boolean;
	onPositionChange: (position: ModulePosition) => void;
	onResize: (position: ModulePosition, direction: string) => void;
	onDragPreview: (position: ModulePosition) => void;
	onDragEnd: () => void;
	onResizeStart: () => void;
	onResizeEnd: () => void;
}

const resizeHandles = {
	top: true,
	right: true,
	bottom: true,
	left: true,
	topRight: true,
	bottomRight: true,
	bottomLeft: true,
	topLeft: true,
};

const resizeHandleStyles: Record<string, CSSProperties> = {
	top: { height: "8px", top: "-4px", cursor: "ns-resize" },
	right: { width: "8px", right: "-4px", cursor: "ew-resize" },
	bottom: { height: "8px", bottom: "-4px", cursor: "ns-resize" },
	left: { width: "8px", left: "-4px", cursor: "ew-resize" },
	topRight: {
		width: "12px",
		height: "12px",
		right: "-5px",
		top: "-5px",
		cursor: "nesw-resize",
	},
	bottomRight: {
		width: "12px",
		height: "12px",
		right: "-5px",
		bottom: "-5px",
		cursor: "nwse-resize",
	},
	bottomLeft: {
		width: "12px",
		height: "12px",
		left: "-5px",
		bottom: "-5px",
		cursor: "nesw-resize",
	},
	topLeft: {
		width: "12px",
		height: "12px",
		left: "-5px",
		top: "-5px",
		cursor: "nwse-resize",
	},
};

/** Free-positioned dashboard panel with eight-direction resizing. */
export function FloatingModule({
	children,
	position,
	minHeight = 150,
	minWidth = 260,
	isLocked = false,
	onPositionChange,
	onResize,
	onDragPreview,
	onDragEnd,
	onResizeStart,
	onResizeEnd,
}: FloatingModuleProps) {
	return (
		<Rnd
			bounds="parent"
			className="floating-module"
			disableDragging={isLocked}
			enableResizing={isLocked ? false : resizeHandles}
			minWidth={minWidth}
			minHeight={minHeight}
			position={{ x: position.x, y: position.y }}
			size={{ width: position.width, height: position.height }}
			dragHandleClassName="drag-handle"
			resizeHandleStyles={resizeHandleStyles}
			onDrag={(_event, data) =>
				onDragPreview({ ...position, x: data.x, y: data.y })
			}
			onDragStop={(_event, data) => {
				onPositionChange({ ...position, x: data.x, y: data.y });
				onDragEnd();
			}}
			onResizeStart={onResizeStart}
			onResize={(_event, direction, element, _delta, nextPosition) => {
				onResize(
					{
						x: nextPosition.x,
						y: nextPosition.y,
						width: element.offsetWidth,
						height: element.offsetHeight,
					},
					direction,
				);
			}}
			onResizeStop={(_event, direction, element, _delta, nextPosition) => {
				onResize(
					{
						x: nextPosition.x,
						y: nextPosition.y,
						width: element.offsetWidth,
						height: element.offsetHeight,
					},
					direction,
				);
				onResizeEnd();
			}}
		>
			{children}
		</Rnd>
	);
}
