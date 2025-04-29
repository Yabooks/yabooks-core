const ChartComponent = (
{
    props: {
        config: {},
        width: { default: "200px" },
        height: { default: "200px" }
    },

    template: `
        <div :style="{ width, height, display: 'inline-block' }">
            <canvas ref="chartCanvas"></canvas>
        </div>
    `,

    data()
    {
        return {
            chart: null
        };
    },

    mounted()
    {
        this.buildChart();
    },

    unmounted()
    {
        this.destroyChart();
    },

    watch:
    {
        config(newConfig)
        {
            this.updateChart(newConfig);
        }
    },

    methods:
    {
        buildChart(config)
        {
            const ctx = this.$refs.chartCanvas.getContext("2d");
            this.chart = new Chart(ctx, config || this.config);
        },

        destroyChart()
        {
            if(this.chart?.destroy)
            {
                this.chart.destroy();
                this.chart = null;
            }
        },

        updateChart(config)
        {
            this.destroyChart();
            this.buildChart(config);
        }
    }
});
