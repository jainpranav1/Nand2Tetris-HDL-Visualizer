// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const hdl_parser = require('hdl-parser');
const fs = require('fs');
const bltin_chips_json = require("./bltin_chips.json");
const express = require('express');
const socket = require("socket.io");

// create server
const app = express()
let server = app.listen(3000);
app.use(express.static(__dirname + '/public'));

// connect client and server with socket api
let io = socket(server);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Nand2Tetris HDL Visualizer is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let visualize_cmd = vscode.commands.registerCommand('nand2tetris-hdl-visualizer.visualize', function () {
		// The code you place here will be executed every time your command is executed

		// get paths of current document and directory
		let doc = vscode.window.activeTextEditor.document;
		let doc_path = doc.uri.fsPath;
		let dir_path = doc_path.substring(0, doc_path.lastIndexOf("\\"));

		// check if document is hdl file
		if (!doc_path.endsWith(".hdl")) {
			vscode.window.showInformationMessage("Error: Input file does not have the .hdl extension.");
			return;
		}		
		
		// parse hdl file and check if the file has proper hdl syntax
		let doc_phdl;
		let doc_text = doc.getText();
		try {
			doc_phdl = hdl_parser.parse(doc_text);
		}
		catch(err) {
			vscode.window.showInformationMessage(err.toString());
			return;
		}

		// Terminology: sc pin = pins of subchips; mc pin = pins of main chip
		// Example: And.hdl - constructed with Nand gates
		// And gate's pins -> mc pins, Nand gate's pins -> sc pins

		// get input/output mc pin names
		let in_mc_pin_names = [];
		let out_mc_pin_names = [];
		doc_phdl["definitions"].forEach(definition => {
			if (definition["type"] == "IN") {
				
				definition["pins"].forEach(def_pin => {
					in_mc_pin_names.push(def_pin["name"]);
				});
			}

			if (definition["type"] == "OUT") {
				
				definition["pins"].forEach(def_pin => {
					out_mc_pin_names.push(def_pin["name"]);
				});
			}
		});

		// add the following to sc pins:
		// input flag (input/output)
		// size (number of wires)
		// mc flag (connected to mc pin)
		// direction (location sc pin is connected (n, s, e, w))
		// const flag (connected to constant: true, false)

		let dir_names = fs.readdirSync(dir_path);
		doc_phdl["parts"].forEach(subchip => {
						
			// get dictionaries that map input/output sc pins to number of wires
			// data comes from either sc pin doc or bltin_chip.json
			// ex. in_to_size = {"a": 16, "b": 16}, out_to_size = {"out": 16}

			let in_to_size = {};
			let out_to_size = {};
			if (dir_names.includes(subchip["name"] + ".hdl")) {

				let sc_path = dir_path + "\\" + subchip["name"] + ".hdl";
				let sc_text = fs.readFileSync(sc_path, 'utf8');
				let sc_phdl = hdl_parser.parse(sc_text);

				sc_phdl["definitions"].forEach(definition => {
					
					if (definition["type"] == "IN") {

						definition["pins"].forEach(def_pin => {
							in_to_size[def_pin["name"]] = def_pin["bits"];
						});
					}
		
					if (definition["type"] == "OUT") {

						definition["pins"].forEach(def_pin => {
							out_to_size[def_pin["name"]] = def_pin["bits"];
						});
					}
				});
			}
			
			else if (bltin_chips_json.hasOwnProperty(subchip["name"])) {
				in_to_size = bltin_chips_json[subchip["name"]]["inputs"];
				out_to_size = bltin_chips_json[subchip["name"]]["outputs"];
			}

			else {
				vscode.window.showInformationMessage("Error: " + subchip["name"] + ".hdl file not present in current directory.");
				return;
			}
			
			// add input flag and size to sc pins
			subchip["connections"].forEach(sc_pin => {
				if (in_to_size.hasOwnProperty(sc_pin["from"]["pin"])) {
					sc_pin["input"] = true;
					
					if (sc_pin["from"]["bits"] != null) {
						if (typeof sc_pin["from"]["bits"] == 'object') {
							sc_pin["size"] = parseInt(sc_pin["from"]["bits"]["from"]) - parseInt(sc_pin["from"]["bits"]["to"]);
						}
						else {
							sc_pin["size"] = 1;
						}
					}
					else {
						sc_pin["size"] = in_to_size[sc_pin["from"]["pin"]];
					}
				}
				else {
					sc_pin["input"] = false;

					if (sc_pin["from"]["bits"] != null) {
						if (typeof sc_pin["from"]["bits"] == 'object') {
							sc_pin["size"] = parseInt(sc_pin["from"]["bits"]["from"]) - parseInt(sc_pin["from"]["bits"]["to"]);
						}
						else {
							sc_pin["size"] = 1;
						}
					}
					else {
						sc_pin["size"] = out_to_size[sc_pin["from"]["pin"]];
					}
				}
			});

			// add mc and const flag to sc pins
			subchip["connections"].forEach(sc_pin => {

				if (sc_pin["input"]) {
					
					if (sc_pin["to"].hasOwnProperty("const")) {
						sc_pin["const"] = true;
						sc_pin["mc"] = false;
					}
					else {
						sc_pin["const"] = false;
					
						if (in_mc_pin_names.includes(sc_pin["to"]["pin"])) {
							sc_pin["mc"] = true;
						}
						else {
							sc_pin["mc"] = false;
						}
					}
				}
				else {
					sc_pin["const"] = false;

					if (out_mc_pin_names.includes(sc_pin["to"]["pin"])) {
						sc_pin["mc"] = true;
					}
					else {
						sc_pin["mc"] = false;
					}
				}
			});

			// add direction to sc pins
			
			let north_l1 = ["sel", "load"];
			let north_l2 = ["zx", "nx", "zy", "ny", "f", "no"];
			let south_l = ["zr", "ng"];
			
			subchip["connections"].forEach(sc_pin => {
				if (sc_pin["input"]) {
					if (north_l1.includes(sc_pin["from"]["pin"])) {
						sc_pin["direc"] = 'n';
					}
					else if ((subchip["name"] == "ALU") && (north_l2.includes(sc_pin["from"]["pin"]))) {
						sc_pin["direc"] = 'n';
					}
					else {
						sc_pin["direc"] = 'w';
					}
				}
				else {
					if ((subchip["name"] == "ALU") && (south_l.includes(sc_pin["from"]["pin"]))) {
						sc_pin["direc"] = 's';
					}
					else {
						sc_pin["direc"] = 'e';
					}
				}
			});
		});

		// shorten names of sc pins and wires to 5 characters
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {
				
				if (sc_pin["from"]["pin"].length > 5) {
					sc_pin["from"]["pin"] = sc_pin["from"]["pin"].slice(0, 5) + "...";
				}

				if (!sc_pin["const"]) {
					if (sc_pin["to"]["pin"].length > 5) {
						sc_pin["to"]["pin"] = sc_pin["to"]["pin"].slice(0, 5) + "...";
					}					
				}				
			});
		});

		// add indices to split sc pin names (ex. a -> a[0:3])
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {

				if (sc_pin["from"]["bits"] != null) {

					if (typeof sc_pin["from"]["bits"] == 'object') {
						sc_pin["from"]["pin"] = sc_pin["from"]["pin"] + "[" + sc_pin["from"]["bits"]["from"] + ":" + sc_pin["from"]["bits"]["to"] +"]";
					}
					else {
						sc_pin["from"]["pin"] = sc_pin["from"]["pin"] + "[" + sc_pin["from"]["bits"] + "]";
					}
				}
			});
		});

		// add indices to the names of split wires connected to mc pins
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {

				if (sc_pin["mc"]) {

					// adjust names of wires
					if (sc_pin["to"]["bits"] != null) {

						if (typeof sc_pin["to"]["bits"] == 'object') {
							sc_pin["to"]["pin"] = sc_pin["to"]["pin"] + "[" + sc_pin["to"]["bits"]["from"] + ":" + sc_pin["to"]["bits"]["to"] +"]";
						}
						else {
							sc_pin["to"]["pin"] = sc_pin["to"]["pin"] + "[" + sc_pin["to"]["bits"] + "]";
						}
					}
				}
			});
		});

		// add mc pins or constants to names of sc pins connected to them
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {
				if (sc_pin["input"]) {
					if (sc_pin["const"]) {
						sc_pin["from"]["pin"] = sc_pin["to"]["const"].toString() + " \u2192\u2800" + sc_pin["from"]["pin"];
					}
					if (sc_pin["mc"]) {
						sc_pin["from"]["pin"] = sc_pin["to"]["pin"].toString() + " \u2192\u2800" + sc_pin["from"]["pin"];
					}
				}
				else {
					if (sc_pin["mc"]) {
						sc_pin["from"]["pin"] = sc_pin["from"]["pin"] + "\u2800\u2192 " + sc_pin["to"]["pin"].toString();
					}
				}


			});
		});

		// add id to each subchip (1, 2, 3, etc.)
		id = 1
		doc_phdl["parts"].forEach(subchip => {
			subchip["id"] = id.toString();
			id += 1;
		});

		// create dictionary that maps wires connecting sub chips to array of input sc pins
		let wire_to_arr = {};
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {
				if (!sc_pin["mc"] && !sc_pin["const"] && sc_pin["input"]) {

					if (wire_to_arr.hasOwnProperty(sc_pin["to"]["pin"])) {
						wire_to_arr[sc_pin["to"]["pin"]].push(subchip["id"] + "." + sc_pin["from"]["pin"]);
					}
					else {
						wire_to_arr[sc_pin["to"]["pin"]] = [subchip["id"] + "." + sc_pin["from"]["pin"]];
					}
				}
			});
		});
		
		// create HDElk graph
		let graph = {
			color: "#fff",
			children: [], 
			edges: []
		};

		// add subchips to children array of HDElk graph
		doc_phdl["parts"].forEach(subchip => {
			let child_arr_entry = {
				id: subchip["id"],
				label: subchip["name"],
				northPorts: [],
				southPorts: [],
				eastPorts: [],
				westPorts: []
			}
			
			subchip["connections"].forEach(sc_pin => {		
				if (sc_pin["direc"] == "n") {
					child_arr_entry["northPorts"].push(sc_pin["from"]["pin"])
				}
				else if (sc_pin["direc"] == "s") {
					child_arr_entry["southPorts"].push(sc_pin["from"]["pin"])
				}
				else if (sc_pin["direc"] == "e") {
					child_arr_entry["eastPorts"].push(sc_pin["from"]["pin"])
				}
				else {
					child_arr_entry["westPorts"].push(sc_pin["from"]["pin"])
				}
			});

			child_arr_entry["eastPorts"] = [...new Set(child_arr_entry["eastPorts"])];
			child_arr_entry["southtPorts"] = [...new Set(child_arr_entry["southPorts"])];

			graph["children"].push(child_arr_entry);
		});

		// add wires connecting sub chips to edges array of HDElk graph
		color = 0;
		doc_phdl["parts"].forEach(subchip => {
			subchip["connections"].forEach(sc_pin => {		

				if (!sc_pin["mc"] && !sc_pin["const"] && !sc_pin["input"]) {
					
					if (wire_to_arr.hasOwnProperty(sc_pin["to"]["pin"])) {
						wire_to_arr[sc_pin["to"]["pin"]].forEach(end => {

							let start = subchip["id"] + "." + sc_pin["from"]["pin"];
							graph["edges"].push({route: [start, end], highlight: color % 5});
						});
					}

					color += 1;
				}
			});
		});

		// show hdl visualization in html file

		let html_str = `<!DOCTYPE html>
		<html>
		<head>
		<title>HDL Visualization</title>
		<script src="elk.bundled.js"></script>
		<script src="svg.min.js"></script>	  
		<script src="hdelk.js"></script>
		<script src="https://cdn.socket.io/4.4.0/socket.io.min.js" integrity="sha384-1fOn6VtTq3PWwfsOrk45LnYcGosJwzMHv+Xh/Jx5303FVOXzEnw0EpLv30mtjmlj" crossorigin="anonymous"></script>
		</head>
		<body>
		<h1 style="font-size:50px; color:#6666cc; margin:10px;">${doc_phdl["name"]}.hdl</h1>
		<div id="diagram_id"></div>
		<script>
		let graph = ${JSON.stringify(graph)};
		hdelk.layout(graph, "diagram_id");
		</script>
		<script>
		let socket = io.connect("http://localhost:3000");
		socket.on('refresh', () => {
			window.location.reload();
		});
		socket.on('end', () => {
			socket.disconnect();
		});
		</script>
		</body>
		</html>`;

		fs.writeFileSync(__dirname + '/public/index.html', html_str);
		//vscode.env.openExternal(__dirname + '/public/HDL_Visualization.html');
		
		// refresh page
		if (io.engine.clientsCount == 0) {
			vscode.env.openExternal('http://localhost:3000/');
		}
		else {
			io.sockets.emit("refresh");
		}
	});

	context.subscriptions.push(visualize_cmd);

}

// this method is called when your extension is deactivated
function deactivate() {
	fs.writeFileSync(__dirname + '/public/index.html', "");
	io.sockets.emit("end");
	io.sockets.close();
	server.close(() => {
		console.log("Server has terminated.")
	})
}

module.exports = {
	activate,
	deactivate
}
