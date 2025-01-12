/* global fabric */

const pdfUrl = `/api/v1/documents/${self.location.search.substring(1)}/binary`; // Path to your PDF
const container = document.getElementById('pdfContainer');
const saveButton = document.getElementById('saveButton');

let fabricCanvases = []; // To store Fabric.js instances for all pages

// Initialize PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@2.6.347/build/pdf.worker.min.js`;

// Load and render the PDF
(async function renderPDF()
{
    const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;

    for(let i = 1; i <= pdfDoc.numPages; i++)
    {
        const page = await pdfDoc.getPage(i);

        const viewport = page.getViewport({ scale: 1.5 });
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        container.appendChild(pageDiv);

        // Create PDF canvas
        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdf-canvas';
        pageDiv.appendChild(pdfCanvas);

        const pdfContext = pdfCanvas.getContext('2d');
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;

        // Render PDF page
        await page.render({
            canvasContext: pdfContext,
            viewport
        }).promise;

        // Create annotation canvas
        const annotationCanvas = document.createElement('canvas');
        annotationCanvas.className = 'annotation-canvas';
        annotationCanvas.width = viewport.width;
        annotationCanvas.height = viewport.height;
        pageDiv.appendChild(annotationCanvas);

        // Initialize Fabric.js on the annotation canvas
        const fabricCanvas = new fabric.Canvas(annotationCanvas, { isDrawingMode: true });
        fabricCanvas.freeDrawingBrush.width = 2;
        fabricCanvas.freeDrawingBrush.color = '#ff0000';

        // Store Fabric.js canvas
        fabricCanvases.push(fabricCanvas);
    }
})();

/*setTimeout(_ =>
{
    fabricCanvases.forEach(fabricCanvas =>
    {
        // Ensure drawing mode is enabled
        fabricCanvas.isDrawingMode = true;
      
        // Intercept pointer events to allow only stylus
        fabricCanvas.upperCanvasEl.addEventListener('pointerdown', e =>
        {
            if(e.pointerType !== 'pen')
            {
                e.preventDefault(); // Block non-pen input
                return; // Stop further processing
            }
        });
      
        // Prevent touch scroll or zoom gestures
        fabricCanvas.upperCanvasEl.addEventListener('touchstart', e => e.preventDefault());
        fabricCanvas.on('mouse:down', event =>
        {
            const pointerEvent = event.e;

            if(pointerEvent.pointerType !== 'pen')
            {
                fabricCanvas.isDrawingMode = false; // Disable drawing temporarily
                setTimeout(() => { fabricCanvas.isDrawingMode = true }, 0); // Restore
            }
        });
      });
}, 1000);*/

// Tool switching logic
document.querySelectorAll('.tool-button').forEach(button =>
{
    button.addEventListener('click', () =>
    {
        const tool = button.dataset.tool;
        fabricCanvases.forEach(fabricCanvas =>
        {
            if(tool === 'eraser')
            {
                fabricCanvas.isDrawingMode = false; // Disable drawing
                fabricCanvas.on('mouse:down', opt =>
                {
                    const pointer = fabricCanvas.getPointer(opt.e);
                    const object = fabricCanvas.findTarget(pointer);
                    if(object) fabricCanvas.remove(object); // Remove the object under the cursor
                });
            }
            else
            {
                fabricCanvas.isDrawingMode = true; // Enable drawing mode

                if(tool === 'highlighter')
                {
                    fabricCanvas.freeDrawingBrush.color = 'rgba(255, 255, 0, .3)';
                    fabricCanvas.freeDrawingBrush.width = 10; // Wider brush for highlighting
                    fabricCanvas.freeDrawingBrush.opacity = 0.3; // Transparent effect
                }

                else // color pen
                {
                    fabricCanvas.freeDrawingBrush.color = tool;
                    fabricCanvas.freeDrawingBrush.width = 2; // Standard pen width
                    fabricCanvas.freeDrawingBrush.opacity = 1; // Solid effect
                }
                fabricCanvas.off('mouse:down'); // Remove eraser behavior
            }
        });
    });
});

// Save annotations
saveButton.addEventListener('click', async () =>
{
    const pdfBuffer = await fetch(pdfUrl).then((res) => res.arrayBuffer());
    const annotations = fabricCanvases.map(canvas =>
    {
        const objects = canvas.getObjects();
        return objects.map((obj) => {
            if(obj.type === 'path')
            {
                return {
                    paths: obj.path.map((path) => (
                    {
                        startX: path[1], // Starting X coordinate of the path
                        startY: path[2], // Starting Y coordinate
                        endX: path[3] || path[1], // Ending X coordinate (or start if it's a point)
                        endY: path[4] || path[2], // Ending Y coordinate (or start if it's a point)
                    })),
                    color: obj.stroke || '#000000', // Color of the path
                    width: obj.strokeWidth || 1, // Width of the path
                };
            }
            return null; // Ignore non-path objects
        }).filter(Boolean); // Filter out nulls
    });

    const formData = new FormData();
    formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }));
    formData.append('annotations', JSON.stringify(annotations));

    const response = await fetch('http://localhost:3000/save-annotations',
    {
        method: 'POST',
        body: formData,
    });

    if(!response.ok)
        throw new Error('Failed to save annotations');

    //const updatedPdfBlob = await response.blob();
});
