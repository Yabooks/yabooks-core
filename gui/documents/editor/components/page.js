const Page = ( // PDF drawing editor
{
    props:
    {
        zoom: .5,
        scale: 2.0,
        image: null,
        annotations: [],
        annotationsSupported: true,
        tool: { color: [ 0, 255, 0 ], opacity: .5, lineWidth: 10 }
    },

    template: `
        <div class="page" :style="{ ...getZoomedSize() }">
            <img v-if="image" :src="image" ref="img" />
            <canvas v-if="annotationsSupported" ref="canvas"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
                @pointerout="onPointerUp"></canvas>
        </div>
    `,

    data: () => (
    {
        isDrawing: false,
        currentPoints: []
    }),

    mounted()
    {
        this.$refs.img.onload = () =>
        {
            this.canvas = this.$refs.canvas;
            this.canvas.width = this.$refs.img.naturalWidth;
            this.canvas.height = this.$refs.img.naturalHeight;
            this.ctx = this.canvas.getContext("2d");

            this.drawAllAnnotations();
            this.$forceUpdate();
        };
    },

    methods:
    {
        getZoomedSize()
        {
            if(this.canvas)
                return {
                    width: parseInt(this.canvas.width * this.zoom) + "px",
                    height: parseInt(this.canvas.height * this.zoom) + "px"
                };
            
            else return {};
        },

        drawAllAnnotations()
        {
            const context = this.ctx;
            if(!context)
                return;

            context.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.annotations.forEach(({ points, color, opacity, lineWidth }) =>
            {
                if(points.length < 2)
                    return;

                context.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
                context.lineWidth = lineWidth * this.scale;
                context.lineCap = "round";

                context.beginPath();
                context.moveTo(points[0].x * this.scale, points[0].y * this.scale);

                for(let i = 1; i < points.length; i++)
                    context.lineTo(points[i].x * this.scale, points[i].y * this.scale);

                context.stroke();
            });
        },

        onPointerDown(e)
        {
            if(!this.annotationsSupported || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.isDrawing = true;

            if(this.tool?.type === "eraser")
                this.checkAndEraseStroke(e.offsetX / this.scale / this.zoom, e.offsetY / this.scale / this.zoom);
            else            
                this.currentPoints.value = [ { x: e.offsetX / this.scale / this.zoom, y: e.offsetY / this.scale / this.zoom } ];
        },

        onPointerMove(e)
        {
            if(!this.annotationsSupported || !this.isDrawing || !['mouse', 'pen'].includes(e.pointerType))
                return;

            if(this.tool?.type === "eraser")
                this.checkAndEraseStroke(e.offsetX / this.scale / this.zoom, e.offsetY / this.scale / this.zoom);
            else
            {
                this.currentPoints.push({ x: e.offsetX / this.scale / this.zoom, y: e.offsetY / this.scale / this.zoom });
                this.drawTempLine(this.currentPoints);
            }
        },

        onPointerUp(e)
        {
            if(!this.annotationsSupported || !this.isDrawing || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.isDrawing = false;

            if(this.tool?.type !== "eraser")
            {
                this.annotations.push(
                {
                    points: [ ...this.currentPoints ],
                    color: this.tool.color,
                    opacity: this.tool.opacity,
                    lineWidth: this.tool.lineWidth
                });

                this.currentPoints = [];
                this.drawAllAnnotations();
                this.saveAnnotations();
            }
        },

        drawTempLine(points)
        {
            const context = this.ctx;
            if(!context)
                return;

            this.drawAllAnnotations(); // clear + redraw existing

            if(points.length < 2)
                return;

            context.strokeStyle = `rgba(${this.tool.color.join(",")}, ${this.tool.opacity})`;
            context.lineWidth = this.tool.lineWidth * this.scale;
            context.lineCap = 'round';

            context.beginPath();
            context.moveTo(points[0].x * this.scale, points[0].y * this.scale);

            for(let i = 1; i < points.length; i++)
                context.lineTo(points[i].x * this.scale, points[i].y * this.scale);

            context.stroke();
        },

        checkAndEraseStroke(x, y)
        {
            const distanceToLineSegment = (px, py, x1, y1, x2, y2) =>
            {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthSquared = dx * dx + dy * dy;
                
                if(lengthSquared === 0)
                    return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
                
                let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
                t = Math.max(0, Math.min(1, t));
                
                const projX = x1 + t * dx;
                const projY = y1 + t * dy;
                
                return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
            };

            const eraserRadius = this.tool.lineWidth;
            let erasedAny = false;

            // Check each annotation from back to front
            for(let i = this.annotations.length - 1; i >= 0; --i)
            {
                const annotation = this.annotations[i];
                const strokeRadius = annotation.lineWidth / 2;
                
                // Check if pointer is near any point in the stroke
                for(let j = 0; j < annotation.points.length - 1; j++)
                {
                    const p1 = annotation.points[j];
                    const p2 = annotation.points[j + 1];
                    
                    // Calculate distance from point to line segment
                    const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
                    
                    if(dist < eraserRadius + strokeRadius)
                    {
                        this.annotations.splice(i, 1);
                        erasedAny = true;
                        break;
                    }
                }
                
                if(erasedAny)
                    break; // Only erase one stroke at a time
            }

            if(erasedAny)
            {
                this.drawAllAnnotations();
                this.saveAnnotations();
            }
        },

        saveAnnotations()
        {
            this.$emit("change");
        }
    }
});
