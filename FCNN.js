
function FCNN() {

	let randomWeight = () => Math.random() * 2 - 1;


	/////////////////////////////////////////////////////////////////////////////
					  ///////    Variables    ///////
	/////////////////////////////////////////////////////////////////////////////

	var w = window.innerWidth;
	var h = window.innerHeight;

	var svg = d3.select("#graph-container").append("svg").attr("xmlns", "http://www.w3.org/2000/svg");
	var g = svg.append("g");
	svg.style("cursor", "move");

	var edgeWidthProportional = false;
	var edgeWidth = 0.5;
	var weightedEdgeWidth = d3.scaleLinear().domain([0, 1]).range([0, edgeWidth]);

	var edgeOpacityProportional = false;
	var edgeOpacity = 1.0
	var weightedEdgeOpacity = d3.scaleLinear().domain([0, 1]).range([0, 1]);

	var edgeColorProportional = false;
	var defaultEdgeColor = "#505050";
	var negativeEdgeColor = "#0000ff";
	var positiveEdgeColor = "#ff0000";
	var weightedEdgeColor = d3.scaleLinear().domain([-1, 0, 1]).range([negativeEdgeColor, "white", positiveEdgeColor]);

	var nodeDiameter = 20;
	var nodeColor = "#ffffff";
	var nodeBorderColor = "#333333";

	var betweenLayers = 160;

	var architecture = [8, 12, 8];
	var betweenNodesInLayer = [20, 20, 20];
	var graph = {};
	var layer_offsets = [];
	var largest_layer_width = 0;
	var nnDirection = 'right';
	var showBias = false;
	var showLabels = true;
	var showArrowheads = false;
	var arrowheadStyle = "empty";
	var bezierCurves = false;
	// NEW: visuals and interactions
	var layerColoring = false;
	var colorblindPalette = false;
	var highContrast = false;
	var skipConnections = [];
	// label font size
	var nominal_text_size = 12;
	var textWidth = 70;
	// palettes
	var paletteDefault = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"]; // category10-like
	var paletteColorblind = ["#000000","#E69F00","#56B4E9","#009E73","#F0E442","#0072B2","#D55E00","#CC79A7","#999999"]; // Okabe-Ito
	var paletteWarm = ["#7b3294","#c2a5cf","#f7f7f7","#fdae61","#d7191c"]; // Spectral-like
	var paletteCool = ["#313695","#4575b4","#74add1","#abd9e9","#e0f3f8","#ffffbf","#fee090","#fdae61","#f46d43","#d73027","#a50026"]; // coolwarm
	var palettePastel = ["#aec7e8","#ffbb78","#98df8a","#ff9896","#c5b0d5","#c49c94","#f7b6d2","#c7c7c7","#dbdb8d","#9edae5"];
	var paletteViridis = ["#440154","#482777","#3f4a8a","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"];
	var paletteName = 'default';
	// drag
	var nodesById = {};

	let sup_map = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
	let sup = (s) => Array.prototype.map.call(s, (d) => (d in sup_map && sup_map[d]) || d).join('');

	let textFn = (layer_index, layer_width) => ((layer_index === 0 ? "Input" : (layer_index === architecture.length-1 ? "Output" : "Hidden")) + " Layer ∈ ℝ" + sup(layer_width.toString()));

	var marker = svg.append("svg:defs").append("svg:marker")
		.attr("id", "arrow")
		.attr("viewBox", "0 -5 10 10")
		.attr("markerWidth", 7)
		.attr("markerHeight", 7)
		.attr("orient", "auto");

	var arrowhead = marker.append("svg:path")
		.attr("d", "M0,-5L10,0L0,5")
		.style("stroke", defaultEdgeColor);

	var link = g.selectAll(".link");
	var node = g.selectAll(".node");
	var text = g.selectAll(".text");

	/////////////////////////////////////////////////////////////////////////////
					  ///////    Methods    ///////
	/////////////////////////////////////////////////////////////////////////////

	function getPalette() {
		if (paletteName === 'colorblind' || colorblindPalette) return paletteColorblind;
		if (paletteName === 'warm') return paletteWarm;
		if (paletteName === 'cool') return paletteCool;
		if (paletteName === 'pastel') return palettePastel;
		if (paletteName === 'viridis') return paletteViridis;
		return paletteDefault;
	}

	function updateLinksForNode(nodeId) {
		let n = nodesById[nodeId];
		if (!n) return;
		link.filter(d => d.source === nodeId || d.target === nodeId)
			.attr("d", (d) => {
				let s = nodesById[d.source];
				let t = nodesById[d.target];
				let sx = s.x, sy = s.y, tx = t.x, ty = t.y;
				if (bezierCurves) {
					let cp1 = [(sx + tx) / 2, sy];
					let cp2 = [(sx + tx) / 2, ty];
					return "M" + sx + "," + sy + "C" + cp1[0] + "," + cp1[1] + " " + cp2[0] + "," + cp2[1] + " " + tx + "," + ty;
				} else {
					return "M" + sx + "," + sy + ", " + tx + "," + ty;
				}
			});
	}

	function moveEntireLayer(layerIndex, dx, dy) {
		graph.nodes.filter(n => n.layer === layerIndex).forEach(n => {
			n.x = (typeof n.x === 'number' ? n.x : 0) + dx;
			n.y = (typeof n.y === 'number' ? n.y : 0) + dy;
			d3.select('#'+n.id).attr('cx', n.x).attr('cy', n.y);
			updateLinksForNode(n.id);
		});
		// move the label visually as well
		text.filter(t => t.layer === layerIndex)
			.attr('x', function(){ var cur = parseFloat(d3.select(this).attr('x')) || 0; return cur + dx; })
			.attr('y', function(){ var cur = parseFloat(d3.select(this).attr('y')) || 0; return cur + dy; });
	}

	function redraw({architecture_=architecture,
					 showBias_=showBias,
					 showLabels_=showLabels,
					 bezierCurves_=bezierCurves,
					 skipConnections_=skipConnections,
					 }={}) {

		architecture = architecture_;
		showBias = showBias_;
		showLabels = showLabels_;
		bezierCurves = bezierCurves_;
		skipConnections = skipConnections_;

		graph.nodes = architecture.map((layer_width, layer_index) => range(layer_width).map(node_index => {return {'id':layer_index+'_'+node_index,'layer':layer_index,'node_index':node_index}}));
		graph.links = pairWise(graph.nodes).map((nodes) => nodes[0].map(left => nodes[1].map(right => {return right.node_index >= 0 ? {'id':left.id+'-'+right.id, 'source':left.id,'target':right.id,'weight':randomWeight()} : null })));
		graph.nodes = flatten(graph.nodes);
		graph.links = flatten(graph.links).filter(l => (l && (showBias ? (parseInt(l['target'].split('_')[0]) !== architecture.length-1 ? (l['target'].split('_')[1] !== '0') : true) : true)));
		if (Array.isArray(skipConnections) && skipConnections.length > 0) {
			let nodesByLayerTemp = {};
			graph.nodes.forEach(n => { if (!nodesByLayerTemp[n.layer]) { nodesByLayerTemp[n.layer] = []; } nodesByLayerTemp[n.layer].push(n); });
			skipConnections.forEach(pair => {
				if (!pair) { return; }
				let s = pair[0];
				let t = pair[1];
				if (s === undefined || t === undefined) { return; }
				if (s === t) { return; }
				let lefts = nodesByLayerTemp[s] || [];
				let rights = nodesByLayerTemp[t] || [];
				lefts.forEach(left => {
					rights.forEach(right => {
						if (!right) { return; }
						if (showBias && (t !== architecture.length - 1) && right.node_index === 0) { return; }
						graph.links.push({ 'id': left.id + '-' + right.id + '-skip', 'source': left.id, 'target': right.id, 'weight': randomWeight(), 'isSkip': true });
					});
				});
			});
		}

		nodesById = {};
		graph.nodes.forEach(n => nodesById[n.id] = n);

		label = architecture.map((layer_width, layer_index) => { return {'id':'layer_'+layer_index+'_label','layer':layer_index,'text':textFn(layer_index, layer_width)}});

		link = link.data(graph.links, d => d.id);
		link.exit().remove();
		link = link.enter()
				   .insert("path", ".node")
				   .attr("class", "link")
				   .merge(link);
		link.select("title").remove();
		link.append("title").text(function(d){ return (typeof d.weight === 'number') ? d.weight.toFixed(3) : ""; });

		node = node.data(graph.nodes, d => d.id);
		node.exit().remove();
		node = node.enter()
				   .append("circle")
				   .attr("r", nodeDiameter/2)
				   .attr("class", "node")
				   .attr("id", function(d) { return d.id; })
				   .on("mousedown", set_focus)
				   .on("mouseup", remove_focus)
				   .call(d3.drag()
						 .on("start", function(d){ d3.select(this).raise().classed("dragging", true); d.lastDragX = d3.event.x; d.lastDragY = d3.event.y; })
						 .on("drag", function(d){
							var ev = d3.event;
							var dx = (typeof ev.dx === 'number') ? ev.dx : (ev.x - (d.lastDragX||ev.x));
							var dy = (typeof ev.dy === 'number') ? ev.dy : (ev.y - (d.lastDragY||ev.y));
							if (ev.sourceEvent && ev.sourceEvent.shiftKey) {
								moveEntireLayer(d.layer, dx, dy);
							} else {
								d.x = ev.x; d.y = ev.y; d3.select(this).attr('cx', d.x).attr('cy', d.y); updateLinksForNode(d.id);
							}
							d.lastDragX = ev.x; d.lastDragY = ev.y;
						 })
						 .on("end", function(d){ d3.select(this).classed("dragging", false); delete d.lastDragX; delete d.lastDragY; }))
				   .merge(node);

		text = text.data(label, d => d.id);
		text.exit().remove();
		text = text.enter()
				   .append("text")
				   .attr("class", "text")
				   .attr("dy", ".35em")
				   .style("font-size", nominal_text_size+"px")
				   .merge(text)
				   .text(function(d) { return (showLabels ? d.text : ""); })
				   .call(d3.drag()
						 .on('start', function(d){ d._lx = d3.event.x; d._ly = d3.event.y; })
						 .on('drag', function(d){ var ev = d3.event; var dx = (typeof ev.dx==='number')?ev.dx:(ev.x - (d._lx||ev.x)); var dy = (typeof ev.dy==='number')?ev.dy:(ev.y - (d._ly||ev.y)); moveEntireLayer(d.layer, dx, dy); d._lx = ev.x; d._ly = ev.y; })
						 .on('end', function(d){ delete d._lx; delete d._ly; }));

		style();
	}

	function redistribute({betweenNodesInLayer_=betweenNodesInLayer,
						   betweenLayers_=betweenLayers,
						   nnDirection_=nnDirection,
						   bezierCurves_=bezierCurves}={}) {

		betweenNodesInLayer = betweenNodesInLayer_;
		betweenLayers = betweenLayers_;
		nnDirection = nnDirection_;
		bezierCurves = bezierCurves_;

		layer_widths = architecture.map((layer_width, i) => layer_width * nodeDiameter + (layer_width - 1) * betweenNodesInLayer[i])

		largest_layer_width = Math.max(...layer_widths);

		layer_offsets = layer_widths.map(layer_width => (largest_layer_width - layer_width) / 2);

		let indices_from_id = (id) => id.split('_').map(x => parseInt(x));

		const numLayers = architecture.length;
		let xRight = (layer, node_index) => layer * (betweenLayers + nodeDiameter) + w/2 - (betweenLayers * layer_offsets.length/3);
		let yRight = (layer, node_index) => layer_offsets[layer] + node_index * (nodeDiameter + betweenNodesInLayer[layer]) + h/2 - largest_layer_width/2;

		let xUp = (layer, node_index) => layer_offsets[layer] + node_index * (nodeDiameter + betweenNodesInLayer[layer]) + w/2  - largest_layer_width/2;
		let yUp = (layer, node_index) => layer * (betweenLayers + nodeDiameter) + h/2 - (betweenLayers * layer_offsets.length/3);

		let xLeft = (layer, node_index) => (numLayers - 1 - layer) * (betweenLayers + nodeDiameter) + w/2 - (betweenLayers * layer_offsets.length/3);
		let yLeft = yRight;

		let xDown = xUp;
		let yDown = (layer, node_index) => (numLayers - 1 - layer) * (betweenLayers + nodeDiameter) + h/2 - (betweenLayers * layer_offsets.length/3);

		let x = xRight, y = yRight;
		if (nnDirection === 'up') { x = xUp; y = yUp; }
		else if (nnDirection === 'left') { x = xLeft; y = yLeft; }
		else if (nnDirection === 'down') { x = xDown; y = yDown; }

		node.attr('cx', function(d) { d.x = (typeof d.x === 'number') ? d.x : x(d.layer, d.node_index); return d.x; })
			.attr('cy', function(d) { d.y = (typeof d.y === 'number') ? d.y : y(d.layer, d.node_index); return d.y; });

		graph.nodes.forEach(d => { nodesById[d.id] = d; });

		link.attr("d", (d) => {
			let s = nodesById[d.source];
			let t = nodesById[d.target];
			let sx = (typeof s.x === 'number') ? s.x : x(s.layer, s.node_index);
			let sy = (typeof s.y === 'number') ? s.y : y(s.layer, s.node_index);
			let tx = (typeof t.x === 'number') ? t.x : x(t.layer, t.node_index);
			let ty = (typeof t.y === 'number') ? t.y : y(t.layer, t.node_index);
			if (bezierCurves) {
				let cp1 = [(sx + tx) / 2, sy];
				let cp2 = [(sx + tx) / 2, ty];
				return "M" + sx + "," + sy + "C" + cp1[0] + "," + cp1[1] + " " + cp2[0] + "," + cp2[1] + " " + tx + "," + ty;
			} else {
				return "M" + sx + "," + sy + ", " + tx + "," + ty;
			}
		});

		text.attr("x", function(d) { return (nnDirection === 'right' ? (w/2 + (betweenLayers * layer_offsets.length/3) - textWidth/2) : w/2 + largest_layer_width/2 + 20 ); })
			.attr("y", function(d) { return (nnDirection === 'right' ? h/2 + largest_layer_width/2 + 20       : (h/2 - (betweenLayers * layer_offsets.length/3)) ); });

	}

	function style({edgeWidthProportional_=edgeWidthProportional,
					 edgeWidth_=edgeWidth,
					 edgeOpacityProportional_=edgeOpacityProportional,
					 edgeOpacity_=edgeOpacity,
					 negativeEdgeColor_=negativeEdgeColor,
					 positiveEdgeColor_=positiveEdgeColor,
					 edgeColorProportional_=edgeColorProportional,
					 defaultEdgeColor_=defaultEdgeColor,
					 nodeDiameter_=nodeDiameter,
					 nodeColor_=nodeColor,
					 nodeBorderColor_=nodeBorderColor,
					 showArrowheads_=showArrowheads,
					 arrowheadStyle_=arrowheadStyle,
					 bezierCurves_=bezierCurves,
					 layerColoring_=layerColoring,
					 colorblindPalette_=colorblindPalette,
					 highContrast_=highContrast,
					 nominal_text_size_=nominal_text_size,
					 paletteName_=paletteName}={}) {
		edgeWidthProportional   = edgeWidthProportional_;
		edgeWidth               = edgeWidth_;
		weightedEdgeWidth       = d3.scaleLinear().domain([0, 1]).range([0, edgeWidth]);
		edgeOpacityProportional = edgeOpacityProportional_;
		edgeOpacity             = edgeOpacity_;
		defaultEdgeColor        = defaultEdgeColor_;
		edgeColorProportional   = edgeColorProportional_;
		negativeEdgeColor       = negativeEdgeColor_;
		positiveEdgeColor       = positiveEdgeColor_;
		weightedEdgeColor       = d3.scaleLinear().domain([-1, 0, 1]).range([negativeEdgeColor, "white", positiveEdgeColor]);
		nodeDiameter            = nodeDiameter_;
		nodeColor               = nodeColor_;
		nodeBorderColor         = nodeBorderColor_;
		showArrowheads          = showArrowheads_;
		arrowheadStyle          = arrowheadStyle_;
		bezierCurves            = bezierCurves_;
		layerColoring           = layerColoring_;
		colorblindPalette       = colorblindPalette_;
		highContrast            = highContrast_;
		nominal_text_size       = nominal_text_size_;
		paletteName             = paletteName_;

		link.style("stroke-width", function(d) { return edgeWidthProportional ? weightedEdgeWidth(Math.abs(d.weight)) : edgeWidth; });
		link.style("stroke-opacity", function(d) { return edgeOpacityProportional ? weightedEdgeOpacity(Math.abs(d.weight)) : edgeOpacity; });
		link.style("stroke", function(d) { return edgeColorProportional ? weightedEdgeColor(d.weight) : defaultEdgeColor; });
		link.style("fill", "none");
		link.attr('marker-end', showArrowheads ? "url(#arrow)" : '');
		marker.attr('refX', nodeDiameter*1.4 + 12);
		arrowhead.style("fill", arrowheadStyle === 'empty' ? "none" : defaultEdgeColor);

		node.attr("r", nodeDiameter/2);
		let palette = getPalette();
		node.style("fill", function(d){ return highContrast ? "#ffffff" : (layerColoring ? palette[d.layer % palette.length] : nodeColor); });
		node.style("stroke", highContrast ? "#000000" : nodeBorderColor);
		text.style("font-size", nominal_text_size+"px");
	}

	/////////////////////////////////////////////////////////////////////////////
					  ///////    Focus    ///////
	/////////////////////////////////////////////////////////////////////////////

	function set_focus(d) {
		d3.event.stopPropagation();
		node.style("opacity", function(o) { return (d == o || o.layer == d.layer - 1) ? 1 : 0.1; });
		link.style("opacity", function(o) { return (o.target == d.id) ? 1 : 0.02; });
	}

	function remove_focus() {
		d3.event.stopPropagation();
		node.style("opacity", 1);
		link.style("opacity", function () { return edgeOpacity; })
	}

	/////////////////////////////////////////////////////////////////////////////
					  ///////    Zoom & Resize   ///////
	/////////////////////////////////////////////////////////////////////////////

	svg.call(d3.zoom().scaleExtent([1 / 2, 8]).on("zoom", zoomed));
	function zoomed() { g.attr("transform", d3.event.transform); }
	function resize() { w = window.innerWidth; h = window.innerHeight; svg.attr("width", w).attr("height", h); }
	d3.select(window).on("resize", resize)
	resize();

	/////////////////////////////////////////////////////////////////////////////
					  ///////    Return    ///////
	/////////////////////////////////////////////////////////////////////////////

	return { 'redraw' : redraw, 'redistribute' : redistribute, 'style' : style, 'graph' : graph, 'link' : link }
}
