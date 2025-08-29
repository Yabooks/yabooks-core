const Page = (
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
            this.currentPoints.value = [ { x: e.offsetX / this.scale / this.zoom, y: e.offsetY / this.scale / this.zoom } ];
        },

        onPointerMove(e)
        {
            if(!this.annotationsSupported || !this.isDrawing || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.currentPoints.push({ x: e.offsetX / this.scale / this.zoom, y: e.offsetY / this.scale / this.zoom });
            this.drawTempLine(this.currentPoints);
        },

        onPointerUp(e)
        {
            if(!this.annotationsSupported || !this.isDrawing || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.isDrawing = false;

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

        saveAnnotations()
        {
            this.$emit("change");
        }
    }
});
