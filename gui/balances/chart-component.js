/* global Chart */

const ChartComponent = (
{
    props: {
        config: {},
        width: { default: "200px" },
        height: { default: "200px" }
    },

    template: `
        <div :style="{ width, height, display: 'inline-block' }">
            <canvas :key="canvasKey" ref="chartCanvas"></canvas>
        </div>
    `,

    data()
    {
        return {
            canvasKey: 0
        };
    },

    created()
    {
        // kept outside of data(): Chart.js must not be wrapped in a Vue proxy
        this.chart = null;
        this.rebuildId = 0;
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
            this.chart = new Chart(ctx, Vue.toRaw(config || this.config));
        },

        destroyChart()
        {
            if(this.chart?.destroy)
            {
                this.chart.destroy();
                this.chart = null;
            }
        },

        async updateChart(config)
        {
            config = Vue.toRaw(config);

            // same chart type: swap data and options in place, Chart.js animates the transition
            if(this.chart && this.chart.config.type === config.type)
            {
                this.chart.data = config.data;
                this.chart.options = config.options;
                this.chart.update();
                return;
            }

            // different chart type: rebuild on a fresh canvas; if another update arrives
            // while waiting for the DOM, only the latest one builds a chart
            const rebuildId = ++this.rebuildId;
            this.destroyChart();
            this.canvasKey++;
            await this.$nextTick();
            if(rebuildId === this.rebuildId)
                this.buildChart(config);
        }
    }
});
