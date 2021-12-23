# nand2tetris-hdl-visualizer README

The nand2tetris hdl visualizer is a vs code extension that quickly generates beautiful visualizations of nand2tetris hdl files. This extension makes use of the hdl-parser tool (https://www.npmjs.com/package/hdl-parser) and the HDElk tool (https://davidthings.github.io/hdelk/).

## Features
The extension provides the command "Visualize HDL File" to the command palette (which can be accessed using cmd + shift + p or ctrl + shift + p). When this command is run, a visualization of the current hdl file is displayed in a browser window. If the command is run again, the browser window automatically refreshes to show the updated hdl file.

\!\[Screenshot\]\(images/screenshot1.png\)

## Credits

This extension was developed by Pranav Jain. This tool was a direct followup to this hdl visualizer project (https://github.com/tcheinen/nand2tetris) which was developed by Pranav Jain, Robert Blum, Teddy Heinen, Aniket Patel, and Nikith Shivani.