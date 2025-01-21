const StructureItem = (
{
    props: {
        parent_id: ""
    },

    template: `
        <div draggable="true">
            {{ parent_id }}
        </div>
    `,

    data()
    {
        return {
            name: "hi"
        };
    },

    async mounted()
    {
        await this.loadItems();
    },

    watch:
    {
        parent_id(newVal, _)
        {
            this.loadItems();
        }
    },

    methods:
    {
        async loadItems()
        {
            console.log(this.parent_id); // TODO
        }
    }
});

StructureItem.components = { StructureItem };