"use client";

import React, {
    useEffect,
    useRef,
    useState,
    WheelEvent,
    MouseEvent,
    KeyboardEvent,
} from "react";

type Viewport = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type ComplexNumber = { x: number; y: number };
type ScreenCoordinate = { x: number; y: number };

type Screen = {
    width: number;
    height: number;
};

const s2c = (x: number, y: number, screen: Screen, view: Viewport) => {
    return {
        x: view.xMin + (x / screen.width) * (view.xMax - view.xMin),
        y: view.yMin + (y / screen.height) * (view.yMax - view.yMin),
    };
};

const c2s = (c: ComplexNumber, screen: Screen, view: Viewport) => {
    return {
        x: ((c.x - view.xMin) / (view.xMax - view.xMin)) * screen.width,
        y: ((c.y - view.yMin) / (view.yMax - view.yMin)) * screen.height,
    };
};

const s2cStr = (x: number, y: number, screen: Screen, view: Viewport) => {
    const { x: cx, y: cy } = s2c(x, y, screen, view);
    if (cy < 0) {
        return `${cx} + ${Math.abs(cy)}i`;
    } else {
        return `${cx} - ${cy}i`;
    }
};

type CacheItem = {
    width?: number;
    height?: number;
    vp?: Viewport;
    maxIterations?: number;
    imageData?: ImageData;
};

const cache_size = 1000;
const cache: CacheItem[] = new Array(cache_size) as CacheItem[];
const getCacheIndex = (
    width: number,
    height: number,
    vp: Viewport,
    maxIterations: number
) => {
    return (
        (maxIterations * 83 +
            width * 41 +
            height * 17 +
            vp.xMin * 13 +
            vp.xMax * 7 +
            vp.yMin * 5 +
            vp.yMax) %
        cache_size
    );
};

const getCacheItem = (
    width: number,
    height: number,
    vp: Viewport,
    maxIterations: number
) => {
    const cacheItem = cache[getCacheIndex(width, height, vp, maxIterations)];
    if (
        width === cacheItem?.width &&
        height === cacheItem?.height &&
        vp === cacheItem?.vp &&
        maxIterations === cacheItem?.maxIterations
    ) {
        return cacheItem;
    } else {
        return null;
    }
};

const setCacheItem = (
    width: number,
    height: number,
    vp: Viewport,
    maxIterations: number,
    imageData: ImageData
) => {
    cache[getCacheIndex(width, height, vp, maxIterations)] = {
        width,
        height,
        vp,
        maxIterations,
        imageData,
    };
};

const defaultRenderer = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    maxIterations: number,
    vp: Viewport
) => {
    const cacheItem = getCacheItem(width, height, vp, maxIterations);
    if (
        width === cacheItem?.width &&
        height === cacheItem?.height &&
        vp === cacheItem?.vp &&
        maxIterations === cacheItem?.maxIterations
    ) {
        ctx.putImageData(cacheItem.imageData!, 0, 0);
        return;
    }

    const imageData = ctx.createImageData(width, height);

    const nProcesses = 8;
    const promises = Array.from({ length: nProcesses }).map((_, core) => {
        return new Promise<void>((resolve) => {
            for (let x = 0; x < width; x++) {
                if (x % nProcesses !== core) continue;
                for (let y = 0; y < height; y++) {
                    const { x: cx, y: cy } = s2c(x, y, { width, height }, vp);

                    let zx = 0;
                    let zy = 0;
                    let iteration = 0;

                    while (zx * zx + zy * zy < 4 && iteration < maxIterations) {
                        const temp = zx * zx - zy * zy + cx;
                        zy = 2 * zx * zy + cy;
                        zx = temp;
                        iteration++;
                    }

                    const color =
                        zx * zx + zy * zy < 4
                            ? 0
                            : Math.floor((iteration / maxIterations) * 255);

                    const index = (y * width + x) * 4;

                    imageData.data[index] = (x / width) * color; // Red
                    imageData.data[index + 1] = (y / height) * color; // Green
                    imageData.data[index + 2] = color; // Blue
                    imageData.data[index + 3] = 255; // Alpha
                }
            }
            resolve();
        });
    });

    Promise.all(promises).then(() => {
        ctx.putImageData(imageData, 0, 0);
        setCacheItem(width, height, vp, maxIterations, imageData);
    });
    // ctx.putImageData(imageData, 0, 0);
};

type Bookmark = {
    name: string;
    view: Viewport;
    maxIterations: number;
};

const ResizableMandelbrot: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 300, height: 150 });
    const [view, setView] = useState<Viewport>({
        xMin: -2.5,
        xMax: 1,
        yMin: -1,
        yMax: 1,
    });
    const [mouseEntered, setMouseEntered] = useState(true);
    const [mouseXY, setMouseXY] = useState({ x: 0, y: 0 });
    const [maxIterations, setMaxIterations] = useState(200);
    const [traceLines, setTraceLines] = useState(false);
    const [superTraceLines, setSuperTraceLines] = useState(false);
    const [showAxis, setShowAxis] = useState(false);
    const [traceLinesLabel, setTraceLinesLabel] = useState("Trace Lines");
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [anchor, setAnchor] = useState<ScreenCoordinate | undefined>(
        undefined
    );

    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries[0]) return;
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        if (canvasRef.current) {
            canvasRef.current.focus();
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // primary rendering logic
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas dimensions
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;

        // create the background image
        const imageWidth = Math.round(dimensions.width);
        const imageHeight = Math.round(dimensions.height);

        // draw the mandelbrot set
        if (view) {
            defaultRenderer(ctx, imageWidth, imageHeight, maxIterations, view);
        }

        // draw trace lines if enabled
        if (traceLines) {
            // const { xMin, xMax, yMin, yMax } = view;
            // const cx = xMin + (mouseXY.x / dimensions.width) * (xMax - xMin);
            // const cy = yMin + (mouseXY.y / dimensions.height) * (yMax - yMin);
            const { x: cx, y: cy } = s2c(
                mouseXY.x,
                mouseXY.y,
                dimensions,
                view
            );

            let zx = 0;
            let zy = 0;
            let iteration = 0;
            const mI = superTraceLines ? 50000 : maxIterations;

            // ctx.fillStyle = "blue";
            ctx.beginPath();
            ctx.moveTo(mouseXY.x, mouseXY.y);
            while (zx * zx + zy * zy < 4 && iteration < mI) {
                const temp = zx * zx - zy * zy + cx;
                zy = 2 * zx * zy + cy;
                zx = temp;
                iteration++;
                const { x, y } = c2s({ x: zx, y: zy }, dimensions, view);
                ctx.lineTo(x, y);
            }

            if (zx * zx + zy * zy < 4) {
                ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
                setTraceLinesLabel("Infinite");
            } else {
                ctx.strokeStyle = "rgba(255, 50, 60, 0.7)";
                setTraceLinesLabel(iteration.toString());
            }
            ctx.stroke();
            ctx.closePath();
        }

        // draw axis
        if (showAxis) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.beginPath();
            const { x, y } = c2s({ x: 0, y: 0 }, dimensions, view);
            ctx.moveTo(0, y);
            ctx.lineTo(dimensions.width, y);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, dimensions.height);
            ctx.stroke();
            ctx.closePath();
        }

        // draw zoom rectangle
        if (anchor) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.strokeRect(
                anchor.x,
                anchor.y,
                mouseXY.x - anchor.x,
                mouseXY.y - anchor.y
            );
        }
    }, [
        dimensions,
        view,
        mouseEntered,
        mouseXY,
        maxIterations,
        traceLines,
        showAxis,
        superTraceLines,
        anchor,
    ]);

    const zoomViewAtMousePointer = (
        zoomFactor: number,
        zoomPosition: { x: number; y: number } | undefined = undefined
    ) => {
        const { xMin, xMax, yMin, yMax } = view;
        const { x: mouseX, y: mouseY } = zoomPosition ? zoomPosition : mouseXY;
        const { x, y } = s2c(mouseX, mouseY, dimensions, view);

        const newMaxX = (xMax - x) * zoomFactor + x;
        const newMinX = x - (x - xMin) * zoomFactor;
        const newMaxY = (yMax - y) * zoomFactor + y;
        const newMinY = y - (y - yMin) * zoomFactor;
        setView({ xMin: newMinX, xMax: newMaxX, yMin: newMinY, yMax: newMaxY });
    };

    const handleZoom = (event: WheelEvent<HTMLCanvasElement>) => {
        if (event.shiftKey) {
            setMaxIterations((prev) => {
                const delta =
                    prev > 200 ? 100 : prev > 50 ? 10 : prev > 15 ? 5 : 1;
                return Math.max(
                    2,
                    event.deltaY < 0 ? prev + delta : prev - delta
                );
            });
            return;
        }

        const zoomFactor = event.deltaY < 0 ? 0.8 : 1.2;
        zoomViewAtMousePointer(zoomFactor);
    };

    const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
        setAnchor({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = (event: MouseEvent<HTMLCanvasElement>) => {
        if (!anchor) return;

        const { x: ax, y: ay } = anchor;
        const mousex = event.clientX;
        const mousey = event.clientY;
        const dx = Math.abs(mousex - ax);
        const dy = Math.abs(mousey - ay);
        const dmin = Math.min(dx, dy);
        if (dmin < 10) {
            setAnchor(undefined);
            return;
        }

        const nx = Math.min(mousex, ax);
        const ny = Math.min(mousey, ay);
        const { x: xMin, y: yMin } = s2c(nx, ny, dimensions, view);
        const { x: xMax, y: yMax } = s2c(
            nx + dmin,
            ny + (2 * dmin) / 3.5,
            dimensions,
            view
        );

        setView({ xMin, xMax, yMin, yMax });
        setAnchor(undefined);
    };

    const handleMove = (event: MouseEvent<HTMLCanvasElement>) => {
        setMouseXY({
            x: event.clientX,
            y: event.clientY,
        });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
        console.log(event.key);
        const { xMin, xMax, yMin, yMax } = view;
        const dx = xMax - xMin;
        const dy = yMax - yMin;
        switch (event.key) {
            case "1":
                setMaxIterations(10);
                break;
            case "2":
                setMaxIterations(50);
                break;
            case "3":
                setMaxIterations(100);
                break;
            case "4":
                setMaxIterations(200);
                break;
            case "5":
                setMaxIterations(500);
                break;
            case "6":
                setMaxIterations(1500);
                break;
            case "7":
                setMaxIterations(2500);
                break;
            case "8":
                setMaxIterations(5000);
                break;
            case "9":
                setMaxIterations(10000);
                break;
            case "0":
                setMaxIterations(20000);
                break;
            case "t":
            case "T":
                setTraceLines((prev) => !prev);
                break;
            case "g":
            case "G":
                setSuperTraceLines((prev) => !prev);
                break;
            case "z":
            case "Z":
                setShowAxis((prev) => !prev);
                break;
            case "b":
            case "B":
                setBookmarks((prev) => [
                    ...prev,
                    {
                        name: `bookmark-${prev.length + 1}`,
                        view,
                        maxIterations,
                    },
                ]);
                break;
            case "Home":
                setView({ xMin: -2.5, xMax: 1, yMin: -1, yMax: 1 });
                setMaxIterations(200);
                break;
            case "PageUp":
                zoomViewAtMousePointer(0.5);
                break;
            case "PageDown":
                zoomViewAtMousePointer(1.5);
                break;
            case "Escape":
                setAnchor(undefined);
                break;
            case "a":
            case "A":
                setView({
                    xMin: xMin - dx / 10,
                    xMax: xMax - dx / 10,
                    yMin,
                    yMax,
                });
                break;
            case "w":
            case "W":
                setView({
                    xMin,
                    xMax,
                    yMin: yMin - dy / 10,
                    yMax: yMax - dy / 10,
                });
                break;
            case "d":
            case "D":
                setView({
                    xMin: xMin + dx / 10,
                    xMax: xMax + dx / 10,
                    yMin,
                    yMax,
                });
                break;
            case "s":
            case "S":
                setView({
                    xMin,
                    xMax,
                    yMin: yMin + dy / 10,
                    yMax: yMax + dy / 10,
                });
                break;
            default:
                break;
        }
    };

    return (
        <div ref={containerRef} style={{ width: "100%", height: "100vh" }}>
            <canvas
                id="canvas"
                ref={canvasRef}
                tabIndex={0}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    cursor: "crosshair",
                }}
                onWheel={(e) => handleZoom(e)}
                onMouseMove={(e) => handleMove(e)}
                onMouseEnter={() => {
                    setMouseEntered(true);
                }}
                onMouseLeave={() => {
                    setMouseEntered(false);
                }}
                onMouseDown={(e) => handleMouseDown(e)}
                onMouseUp={(e) => handleMouseUp(e)}
                onKeyDown={(e) => handleKeyDown(e)}
            />
            <div style={{ position: "absolute", top: 0, left: 0 }}>
                <h1 className="text-white">
                    c = {s2cStr(mouseXY.x, mouseXY.y, dimensions, view)} (
                    {mouseXY.x}, {mouseXY.y})
                </h1>
                <h1 className="text-white">max iters: {maxIterations}</h1>
                <h1 className="text-white">
                    zoom: {(3.5 / (view.xMax - view.xMin)).toFixed(2)}x
                </h1>
                {traceLines && (
                    <h1 className="text-white">
                        escape count: {traceLinesLabel}
                    </h1>
                )}
                {superTraceLines && (
                    <h1 className="text-purple-500">Super Trace!</h1>
                )}

                <h1 className="text-white underline">Bookmarks</h1>
                <ul>
                    {bookmarks.map((bookmark, index) => (
                        <li className="text-white" key={index}>
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setView(bookmark.view);
                                    setMaxIterations(bookmark.maxIterations);
                                }}
                            >
                                {bookmark.name}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ResizableMandelbrot;
