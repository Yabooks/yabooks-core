const Page = (
{
    props:
    {
        image: null,
        annotations: [],
        annotationsSupported: true,
        tool: { color: [ 0, 255, 0 ], opacity: .5, lineWidth: 10 }
    },

    template: `
        <span class="page">
            <img :src="image" ref="img" />
            <canvas ref="canvas"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
                @pointerout="onPointerUp"></canvas>
        </span>
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
        };
    },

    methods:
    {
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
                context.lineWidth = lineWidth;
                context.lineCap = "round";

                context.beginPath();
                context.moveTo(points[0].x * 2, points[0].y * 2);

                for(let i = 1; i < points.length; i++)
                    context.lineTo(points[i].x * 2, points[i].y * 2);

                context.stroke();
            });
        },

        onPointerDown(e)
        {
            if(!this.annotationsSupported || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.isDrawing = true;
            this.currentPoints.value = [ { x: e.offsetX / 2, y: e.offsetY / 2 } ];
        },

        onPointerMove(e)
        {
            if(!this.annotationsSupported || !this.isDrawing || !['mouse', 'pen'].includes(e.pointerType))
                return;

            this.currentPoints.push({ x: e.offsetX / 2, y: e.offsetY / 2 });
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
            context.lineWidth = this.tool.lineWidth;
            context.lineCap = 'round';

            context.beginPath();
            context.moveTo(points[0].x * 2, points[0].y * 2);

            for(let i = 1; i < points.length; i++)
                context.lineTo(points[i].x * 2, points[i].y * 2);

            context.stroke();
        },

        saveAnnotations()
        {
            this.$emit("change");
        }
    }
});
