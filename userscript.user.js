// ==UserScript==
// @name         Krunker.io Map Editor Mod
// @description  Krunker.io Map Editor Mod
// @updateURL    https://github.com/Tehchy/Krunker.io-Map-Editor-Mod/raw/master/userscript.user.js
// @downloadURL  https://github.com/Tehchy/Krunker.io-Map-Editor-Mod/raw/master/userscript.user.js
// @version      2.6.3
// @author       Tehchy
// @include      /^(https?:\/\/)?(www\.)?(.+)krunker\.io\/editor\.html$/
// @require      https://github.com/Tehchy/Krunker.io-Map-Editor-Mod/raw/master/assets.js?v=2.5.3
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

window.stop()
document.innerHTML = ""

class Mod {
    constructor(v) {
        this.version = v;
        this.hooks = {
            objectInstance: null,
            editor: null,
            gui: null,
            three: null
        };
        this.defaultSettings = null;
        this.settings = {
            degToRad: false,
            backupMap: false,
            antiAlias: false,
            highPrecision: false,
            gridVisibility: true,
            gridOpacity: .25,
            gridSize: 100,
            gridDivisions: 10,
            objectHighlight: false,
            mergeVoxels: false,
            phOpacity: 0.3,
            phEmissive: '#FFFFFF',
            phColor:'#FFFFFF',
        };
        this.intersected = null;
        this.voxelSize = 10;
        this.copy = null;
        this.groups = [];
        this.rotation = 0;
        this.mainMenu = null;
        this.assetMenu = null;
        this.gui = null;
        this.hexToRGBArray = ((hex) => hex.match(/[A-Za-z0-9]{2}/g).map(v => parseInt(v, 16)));
        this.rgbArrayToHex = ((rgb) => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`);
        this.onLoad();
    }

    objectSelected(group = false) {
        let selected = this.hooks.editor.transformControl.object;
        return selected ? (group ? (Object.keys(this.groups).includes(selected.uuid) ? selected : false) : selected) : false;
    }

    loadFile(callback, args = null) {
        let file = document.createElement('input');
        file.type = 'file';
        file.id = 'jsonInput';
        
        let self = this;
        file.addEventListener('change', ev => {
            if (ev.target.files.length != 1) return alert('Please select 1 file');
            let f = ev.target.files[0];
            let reader = new FileReader();

            reader.onload = (theFile => {
                return e => {
                    self[callback](e.target.result, args);
                };
            })(f);

            reader.readAsText(f);
        }, false);
        
        file.type = 'file';
        file.id = 'jsonInput';
        file.click();
        
        return;
    }

    jsonInput(fromfile = false) {
        if (fromfile) {
            return this.loadFile('replaceObject', true);
        }
        let json = prompt("Import Object Json", "");
        if (json != null && json != "" && this.objectSelected()) this.replaceObject(json, true);
    }
    
    importMapFile(t = null) {
        if (!t) return this.loadFile('importMapFile');
        try {
            let e = JSON.parse(t);
            this.hooks.editor.clearMap();
            for (let t of e.objects) this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(t), true);
            delete e.objects,
            e.camPos && this.hooks.editor.addObject(new this.hooks.objectInstance({id: 6, p: e.camPos}), true);
            for (let t of e.spawns) this.hooks.editor.addObject(new this.hooks.objectInstance({id: 5, p: [t[0], t[1], t[2]], tm: t[3]}), true);
            Object.assign(this.hooks.editor.mapConfig, e)
        } catch (t) {
            console.log(t),
            alert("Failed to import map with error:\n" + t.toString())
        }
    }

    replaceObject(str, skip = false, fix = false) {
        let selected = this.objectSelected();
        if (!selected) {
            //this.hooks.editor.addObject(this.hooks.objectInstance.defaultFromType("CUBE"))
            //selected = this.objectSelected()
        }
        if (selected) {
            if (!fix) this.hooks.editor.removeObject();
            
            let jsp = JSON.parse(str);
            jsp = jsp.objects ? jsp.objects : jsp;
            
            let rotation = this.rotation;
            if (fix) {
                this.hooks.gui.__folders["Object Config"].__controllers[1].setValue(false);
                if (fix == "VEHICLE") rotation = 360 - this.toDegree(selected.rotation.y);
            }
             
            if (rotation > 0) {
                jsp = this.rotateObjects(jsp, rotation);
            }
            
            let center = this.findCenter(jsp);
            for (let ob of jsp) {
                ob.p[0] += selected.userData.owner.position.x - center[0];
                ob.p[1] += selected.userData.owner.position.y - (selected.scale.y / 2) - center[1];
                ob.p[2] += selected.userData.owner.position.z - center[2] - (fix == "VEHICLE" ? 0.5 : 0);
                
                this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(ob), skip);
            }
            this.rotation = 0;
            this.assetMenu.__controllers[0].setValue(this.rotation);
        } else {
            alert("You must select a object first");
        }
    }

    toRadians(angle) {
        return angle * (Math.PI / 180);
    }

    toDegree(angle) {
      return angle * (180 / Math.PI);
    }

    rotateObjects(jsp, deg) {
        //Credit JustProb
        switch (deg) {
            case 90: return this.changeAngle(jsp);
            case 180: return this.reflectAngle(jsp);
            case 270: return this.reflectAngle(this.changeAngle(jsp));
            default: return this.rotate3D(jsp, deg);
        }
        return jsp;
    }

    rotate3D(jsp, deg) {
        //Credit JustProb
        deg = this.toRadians(deg - 180);

        for (let ob of jsp) {
            if (ob.id == 4) {
                alert('Sorry we cant rotate planes (Ramps)');
                return jsp;
            }
            let dist = Math.sqrt(ob.p[0] * ob.p[0] + ob.p[2] * ob.p[2]);
            let angle = this.getAngle(ob);
            ob.p[0] = -1 * Math.cos(-angle + deg) * dist;
            ob.p[2] = Math.sin(angle - deg) * dist;
            if (ob.r == undefined) ob.r = [0,0,0];
            ob.r[1] = this.toRadians(360 - this.toDegree(deg)) + ob.r[1];
        }

        return jsp;
    }

    getAngle(ob, live = false) {
        //Credit JustProb
        let x = live ? ob.x : ob.p[0],
            z = live ? ob.z : ob.p[2],
            angle =  Math.atan2(-1 * z, x);
        return angle < 0 ? angle + (Math.PI * 2) : angle;
    } 

    changeAngle(jsp){
        //Credit JustProb
        for (let ob of jsp) {
            let x = ob.s[0],
                y = ob.s[2];
            ob.s[0] = y;
            ob.s[2] = x;
            let a = ob.p[0],
                b = ob.p[2];
            ob.p[0] = b;
            ob.p[2] = a;
        }
        
        return jsp;
    }

    reflectAngle(jsp){
        //Credit JustProb
        for (let ob of jsp) {
            ob.p[0] = -1 * ob.p[0];
            ob.p[2] = -1 * ob.p[2];
        }
        return jsp;
    }

    findCenter(jsp) {
        let min = jsp[0].p[1],
        xMin = jsp[0].p[0] - (jsp[0].s[0] /2),
        xMax = jsp[0].p[0] + (jsp[0].s[0] /2),
        yMin = jsp[0].p[2] - (jsp[0].s[2] /2),
        yMax = jsp[0].p[2] + (jsp[0].s[2] /2);


        for (let ob of jsp) {
            if (ob.p[1]  < min) min = ob.p[1];
            if (ob.p[0] - (ob.s[0] /2) < xMin) xMin = ob.p[0] - (ob.s[0] /2);
            if (ob.p[0] + (ob.s[0] /2) > xMax) xMax = ob.p[0] + (ob.s[0] /2);
            if (ob.p[2] - (ob.s[2] /2) < yMin) yMin = ob.p[2] - (ob.s[2] /2);
            if (ob.p[2] + (ob.s[2] /2) > yMax) yMax = ob.p[2] + (ob.s[2] /2);
        }

        return [Math.round((xMin + xMax)/2), min, Math.round((yMin + yMax)/2)];
    }
    
    findMapCenter() {
        let jsp = this.hooks.editor.objInstances,
        min = jsp[0].position.y,
        xMin = jsp[0].position.x - (jsp[0].scale.x /2),
        xMax = jsp[0].position.x + (jsp[0].scale.x /2),
        yMin = jsp[0].position.z - (jsp[0].scale.z /2),
        yMax = jsp[0].position.z + (jsp[0].scale.z /2);


        for (let ob of jsp) {
            if (ob.pos[1]  < min) min = ob.pos[1];
            if (ob.pos[0] - (ob.size[0] /2) < xMin) xMin = ob.pos[0] - (ob.size[0] /2);
            if (ob.pos[0] + (ob.size[0] /2) > xMax) xMax = ob.pos[0] + (ob.size[0] /2);
            if (ob.pos[2] - (ob.size[2] /2) < yMin) yMin = ob.pos[2] - (ob.size[2] /2);
            if (ob.pos[2] + (ob.size[2] /2) > yMax) yMax = ob.pos[2] + (ob.size[2] /2);
        }

        return [Math.round((xMin + xMax)/2), min, Math.round((yMin + yMax)/2)];
    }

    applyCenter(objects) {
        //justprob <3
        let center = this.findCenter(objects);
        for (let ob of objects){
            ob.p[0] -= center[0];
            ob.p[1] -= center[1];
            ob.p[2] -= center[2];
        }
    }

    reflect(jsp, dir) {
        //justprob <3
        let obs = jsp.objects ? jsp.objects : jsp;
        let reference = this.findCenter(obs);
        for (let ob of obs) {
            ob.p[dir] * -1;
            ob.p[dir] += 2 * (reference[dir] - ob.p[dir]);
            
            if ('d' in ob) {
                if ((dir == 0 && (ob.d == 0 || ob.d == 2)) || (dir == 2 && (ob.d == 1 || ob.d == 3))) ob.d = Math.abs(dir + 2 - ob.d);
            }
        }
            
        if ('spawns' in jsp) {
            for (let spwn of jsp.spawns) {
                spwn[dir] * -1;
                spwn[dir] += 2 * (reference[dir] - spwn[dir]);
            }
        }
        
        if ('camPos' in jsp) {
            jsp.camPos[dir] * -1;
            jsp.camPos[dir] += 2 * (reference[dir] - jsp.camPos[dir]);
        }
        
        this.download(JSON.stringify(jsp), 'reflect.txt', 'text/plain');
        return jsp;
    }
    
    reflectMap() {
        if (this.settings.backupMap) this.backupMap();
        
        let dir = parseInt(this.mainMenu.__folders["Other Features"].__folders["Reflect Map"].__controllers[0].getValue()),
        reference = this.findMapCenter();
            
        for (let ob of this.hooks.editor.objInstances) {
            let pos = ob.pos;
            
            pos[dir] * -1;
            pos[dir] += 2 * (reference[dir] - pos[dir]);
            ob.pos = pos;
            
            if (ob.direction != null) {
                if ((dir == 0 && (ob.direction == 0 || ob.direction == 2)) || (dir == 2 && (ob.direction == 1 || ob.direction == 3))) ob.direction = Math.abs(dir + 2 - ob.direction);
            }
        }
        this.mainMenu.__folders["Other Features"].__folders["Reflect Map"].__controllers[0].setValue(0);
        this.mainMenu.__folders["Other Features"].__folders["Reflect Map"].close();
    }

    copyObjects(cut = false, group = false, ret = false) {
        let selected = this.objectSelected();
        if (!selected) return alert('Stretch a cube over your objects then try again');
        if (group && this.groups && Object.keys(this.groups).includes(selected.uuid)) return alert('You cant combine groups');
        
        let pos = {
            minX: selected.position.x - (selected.scale.x / 2), 
            minY: selected.position.y, 
            minZ: selected.position.z - (selected.scale.z / 2),  
            maxX: selected.position.x + (selected.scale.x / 2), 
            maxY: selected.position.y + selected.scale.y, 
            maxZ: selected.position.z + (selected.scale.z / 2), 
        };
        let intersect = [];
        let obbys = [];
        for (let ob of this.hooks.editor.objInstances) {
            if (ob.boundingMesh.uuid == selected.uuid) continue;
            if (this.intersect({
                    minX: ob.boundingMesh.position.x - (ob.boundingMesh.scale.x / 2), 
                    minY: ob.boundingMesh.position.y, 
                    minZ: ob.boundingMesh.position.z - (ob.boundingMesh.scale.z / 2), 
                    maxX: ob.boundingMesh.position.x + (ob.boundingMesh.scale.x / 2), 
                    maxY: ob.boundingMesh.position.y + ob.boundingMesh.scale.y, 
                    maxZ: ob.boundingMesh.position.z + (ob.boundingMesh.scale.z / 2)
                }, pos)) {
                if (!group) obbys.push(ob);
                intersect.push(group ? ob.boundingMesh.uuid : ob.serialize());
            }
        }
        
        if (!group) {
            if (cut && obbys.length && !group) {
                for (let i = 0; i < obbys.length; i++) {
                    this.hooks.editor.removeObject(obbys[i]);
                }
            }
            
            if (ret) {
                return intersect;
            } else {
                this.copy = JSON.stringify(intersect);
            }
        } else {
            selected.userData.owner.emissive = 16777215;
            selected.userData.owner.opacity = 0.5;
            selected.userData.owner.color = 0;
            this.groups[selected.uuid] = {
                owner: selected, 
                pos: {x: selected.position.x, y: selected.position.y, z: selected.position.z}, 
                scale: {x: selected.scale.x, y: selected.scale.y, z: selected.scale.z},
                objects: intersect
            };
        }
    }

    exportObjects(full = false) {
        let obs = this.copyObjects(false, false, true);
        if (obs.length == 0) return alert('There was nothing to save');
        let nme = prompt("Name your asset", "");
        if (nme == null || nme == "") return alert('Please name your asset');
            
        let center = this.findCenter(obs);
        for (let ob of obs) {
            ob.p[0] -= center[0];
            ob.p[1] -= center[1];
            ob.p[2] -= center[2];
        }
    
        if (full) 
            obs = {
                "name": "asset_" + nme.replace(/ /g,"_"),
                "modURL":"https://www.dropbox.com/s/4j76kiqemdo6d9a/MMOKBill.zip?dl=0",
                "ambient":9937064,
                "light":15923452,
                "sky":14477549,
                "fog":9280160,
                "fogD":900,
                "camPos":[0,0,0],
                "spawns":[], 
                "objects": obs
            };
        this.download(JSON.stringify(obs), 'asset_' + nme.replace(/ /g,"_") + '.txt', 'text/plain');
        this.mainMenu.__folders['MultiObject'].__folders['Export'].close();
    }

    pasteObjects() {
        if (!this.copy) return alert('Please copy objects first');
        if (!this.objectSelected()) return alert('Select a object you would like to replace with your copied objects');
        this.replaceObject(this.copy);
    }

    removeGroup() {
        if (Object.keys(this.groups).length == 0) return;
        
        let selected = this.objectSelected(true);
        if (!selected) return;
        
        let remOb = [];
        
        this.groups[selected.uuid].objects.push(selected.uuid);
        let obs = this.hooks.editor.objInstances.filter(ob => this.groups[selected.uuid].objects.includes(ob.boundingMesh.uuid));
       /* for (let i = 0; i < this.hooks.editor.objInstances.length; i++) {
            if (!this.groups[selected.uuid].objects.includes(this.hooks.editor.objInstances[i].boundingMesh.uuid)) continue
            
                remOb.push(this.hooks.editor.objInstances[i])
        }*/
            
        for (let i = 0; i < obs.length; i++);
            this.hooks.editor.removeObject(obs[i]);
        
        delete this.groups[selected.uuid];
    }

    duplicateGroup() {
        if (Object.keys(this.groups).length == 0) return;

        let selected = this.objectSelected(true);
        if (!selected) return alert('You cant duplicate a group that doesnt exist');
            
        let group = this.groups[selected.uuid];
        let obs = this.hooks.editor.objInstances.filter(ob => group.objects.includes(ob.boundingMesh.uuid));
        let newObs = [];
        
        for (let ob of obs) {
            let newOb = this.hooks.objectInstance.deserialize(ob.serialize());
            newObs.push(newOb.boundingMesh.uuid);
            this.hooks.editor.addObject(newOb);
        }
        
        let groupBox = this.hooks.objectInstance.deserialize(selected.userData.owner.serialize());
        this.hooks.editor.addObject(groupBox);
        
        selected = this.objectSelected();
        this.groups[selected.uuid] = {
            owner: selected, 
            pos: {x: selected.position.x, y: selected.position.y, z: selected.position.z},
            scale: {x: selected.scale.x, y: selected.scale.y, z: selected.scale.z},
            objects: newObs
        };
    }

    checkGroup() {
        if (Object.keys(this.groups).length == 0) return;
        
        for (let uuid in this.groups) {
            let group = this.groups[uuid];
            
            //Position Change Check
            let currPos = group.owner.position,
                oldPos = group.pos,
                diffPos = [currPos.x - oldPos.x, currPos.y - oldPos.y, currPos.z - oldPos.z],
                changedPos = !(diffPos[0] === 0 && diffPos[1] === 0 && diffPos[2] === 0);
            
            //Scale Change Check
            let currScale = group.owner.scale,
                oldScale = group.scale,
                diffScale = [(currScale.x / oldScale.x) , (currScale.y  / oldScale.y), (currScale.z / oldScale.z)],
                changedScale = !(diffScale[0] === 1 && diffScale[1] === 1 && diffScale[2] === 1);
                
            if (!changedPos && !changedScale) continue; // no changes
            
            let obs = this.hooks.editor.objInstances.filter(ob => group.objects.includes(ob.boundingMesh.uuid));

            for (let ob of obs) {
                if (changedScale) {
                    ob.boundingMesh.position.x *= diffScale[0];
                    ob.boundingMesh.position.y *= diffScale[1];
                    ob.boundingMesh.position.z *= diffScale[2];
                    
                    ob.boundingMesh.scale.x *= diffScale[0];
                    ob.boundingMesh.scale.y *= diffScale[1];
                    ob.boundingMesh.scale.z *= diffScale[2];
                } else {
                    ob.boundingMesh.position.x += diffPos[0];
                    ob.boundingMesh.position.y += diffPos[1];
                    ob.boundingMesh.position.z += diffPos[2];
                }
            }
            
            this.groups[group.owner.uuid].pos = {x: currPos.x, y: currPos.y, z: currPos.z};
            this.groups[group.owner.uuid].scale = {x: currScale.x, y: currScale.y, z: currScale.z};
        }
    }

    stopGrouping(all = false) {
        if (Object.keys(this.groups).length == 0) return alert('You cant stop a group that doesnt exist');
            
        if (all) {
            let obs = this.hooks.editor.objInstances.filter(ob => Object.keys(this.groups).includes(ob.boundingMesh.uuid));
            for (let ob of obs) {
                this.hooks.editor.removeObject(ob);
            }
            this.groups = [];
        } else {
            let selected = this.objectSelected(true);
            if (!selected) return alert('You cant stop a group that doesnt exist');
            
            delete this.groups[selected.uuid];
            return this.hooks.editor.removeObject(selected.userData.owner);
        }
    }

    editGroup(change = 'texture', val = null) {
        if (Object.keys(this.groups).length == 0) return alert('You cant edit a group that doesnt exist');
        let selected = this.objectSelected(true);
        if (!selected) return alert('You cant edit a group that doesnt exist');
        let group = this.groups[selected.uuid];
        let obs = this.hooks.editor.objInstances.filter(ob => group.objects.includes(ob.boundingMesh.uuid));
        switch (change) {
            case 'texture': for (let ob of obs) ob.texture = val; break;
            case 'color': for (let ob of obs) ob.color = val; break;
        }
    }

    fixHitbox() {
        let selected = this.objectSelected();
        if (!selected) return;
        switch(selected.userData.owner.objType) {
            case 'VEHICLE':
                this.replaceObject('[{"p":[0,0,0],"s":[47,9,17],"v":1},{"p":[5,9,0],"s":[26,6,17],"v":1}]', false, selected.userData.owner.objType);
                break;
            case 'TREE':
                this.replaceObject('[{"p":[0,0,0],"s":[9,55,9],"v":1},{"p":[0,37,16],"s":[15,15,15],"v":1},{"p":[0,30,-16],"s":[15,15,15],"v":1},{"p":[0,29,11],"s":[4,4,13],"v":1},{"p":[0,33,16],"s":[4,4,4],"v":1},{"p":[0,36,-6],"s":[4,4,5],"v":1},{"p":[0,55,0],"s":[37,37,37],"v":1}]', false, selected.userData.owner.objType);
                break;
        }
    }

    spawnPlaceholder() {
        let pos = this.hooks.editor.camera.getWorldPosition();
        let obph = {p: [pos.x, pos.y - 10, pos.z], s: [10, 10, 10], e: this.settings.phEmissive, o: this.settings.phOpacity, c: this.settings.phColor};
        this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(obph));
    }

    colorizeMap(input = false, gold = false, rand = false) {
        if (this.settings.backupMap) this.backupMap();
        
        if (input != false && (input == null || input == "")) return alert("Please input colors (ex: #000000,#ffffff)");
            
        if (input) input = input.trim().split(',');

        for (let ob of this.hooks.editor.objInstances) {
            if (input) ob.color = input.length > 1 ? input[Math.floor(Math.random() * input.length)] : input[0];
            if (gold) ob.color = "#FFDF00", ob.emissive = "#D4AF37";
            if (rand) ob.color = this.getRandomColor();
        }
    }

    getRandomColor() {
        let length = 6,
            chars = '0123456789ABCDEF',
            hex = '#';
        while (length--) hex += chars[(Math.random() * 16) | 0];
        return hex;
    }

    scaleMap() {
        if (this.settings.backupMap) this.backupMap();
            
        let sX = this.mainMenu.__folders["Other Features"].__folders["Scale Map"].__controllers[0].getValue(),
            sY = this.mainMenu.__folders["Other Features"].__folders["Scale Map"].__controllers[1].getValue(),
            sZ = this.mainMenu.__folders["Other Features"].__folders["Scale Map"].__controllers[2].getValue();
            
        for (let ob of this.hooks.editor.objInstances) {
            let pos = ob.pos, size = ob.size;
            
            pos[0] *= sX;
            pos[1] *= sY;
            pos[2] *= sZ;

            size[0] *= sX;
            size[1] *= sY;
            size[2] *= sZ;
            
            ob.size = size;
            ob.pos = pos;
        }
    }

    convertVoxel(str, insert = false) {
        if (insert && ! this.objectSelected()) return alert('Select a object to replace first');
        //try {
            let voxels = JSON.parse(str);
            let mapout = {"name":"modmap","modURL":"","ambient":9937064,"light":15923452,"sky":14477549,"fog":9280160,"fogD":900,"camPos":[0,0,0],"spawns":[],"objects":[]};
            let vlist = [];
            for (let vx of voxels.voxels) 
                vlist.push([parseInt(vx.x), parseInt(vx.y), parseInt(vx.z)]);

            vlist = vlist.sort((a, b) => {
                let retVal = 0;
                if (a[1] != b[1]) retVal = a[1] > b[1]? 1 : -1;
                else if (a[2] != b[2]) retVal = a[2] > b[2]? 1 : -1;
                else if (a[0] != b[0]) retVal = a[0] > b[0]? 1 : -1;
                return retVal;
            });

            for (let voxel of vlist) 
                mapout.objects.push(this.voxelToObject(voxel));
             
            if (this.settings.mergeVoxels) mapout.objects = this.mergeObjects(mapout.objects);
            if (insert) this.replaceObject(JSON.stringify(mapout.objects));
            if (!insert) this.download(JSON.stringify(mapout), 'convertedVoxels.txt', 'text/plain');
        //} catch (e) {
            //console.log(e);
            //alert("Failed to load voxels:\n" + e.toString());
        //}
        
    }

    convert(insert = false) {
        this.loadFile('convertVoxel', insert);
    }

    voxelToObject(voxel) {
        return {
            'p': [
                parseInt(voxel[0]) * this.voxelSize, 
                parseInt(voxel[1]) * this.voxelSize, 
                parseInt(voxel[2]) * this.voxelSize
            ], 
            's': [this.voxelSize, this.voxelSize, this.voxelSize]
        };
    }

    mergeObjects(objs) {
        if(objs.length < 2) return objs;

        let objectsMerged = 0;
        for (let axis = 0; axis < 3; axis++) {
            let axis1 = (axis + 1) % 3;
            let axis2 = (axis + 2) % 3;
            for (let i = 0; i < objs.length - 1; i++) {
                for (let j = i + 1; j < objs.length; j++) {
                    let cmi = axis % 2 ? objs[i].p[axis] + objs[i].s[axis] / 2 : objs[i].p[axis];//center of mass
                    let cmj = axis % 2 ? objs[j].p[axis] + objs[j].s[axis] / 2 : objs[j].p[axis];
                    if (objs[j].s[axis1] == objs[i].s[axis1] && objs[j].s[axis2] == objs[i].s[axis2] && 
                        objs[j].p[axis1] == objs[i].p[axis1] && objs[j].p[axis2] == objs[i].p[axis2] && 
                        Math.abs(cmj - cmi) <= Math.abs(objs[j].s[axis] / 2 + objs[i].s[axis] / 2)) {
                        let sX = Math.abs(cmj - cmi) + Math.abs(objs[j].s[axis] / 2 + objs[i].s[axis] / 2);
                        let pX = (cmj + (objectsMerged + 1) * cmi) / (objectsMerged + 2);
                        if(axis == 1) pX = Math.min(objs[i].p[axis], objs[j].p[axis]);
                        objs[i].p[axis] = pX;
                        objs[i].s[axis] = sX;
                        objs.splice(j, 1);
                        objectsMerged++;
                        j--; 
                    }
                }
                objectsMerged = 0;
            } 
        }

        return objs;
    }


    textToObjects() {
        let input = prompt("Input text", "");
        if (input != false && (input == null || input == "")) return alert("Please input proper text");
        input = input.toLowerCase();
        let alphabet = {
            'a': [{"p":[-3,0,0],"s":[1,8,1]},{"p":[3,0,0],"s":[1,8,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,4,0],"s":[5,1,1]}],
            'b': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[3,5,0],"s":[1,3,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,4,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[3,1,0],"s":[1,3,1]}],
            'c': [{"p":[-3,1,0],"s":[1,7,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,1,1]}],
            'd': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[3,1,0],"s":[1,7,1]}],
            'e': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[0,4,0],"s":[5,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[3,4,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,1,1]}],
            'f': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,4,0],"s":[5,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[3,4,0],"s":[1,1,1]}],
            'g': [{"p":[-3,1,0],"s":[1,7,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,4,1]},{"p":[1,3,0],"s":[3,1,1]}],
            'h': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[0,4,0],"s":[5,1,1]},{"p":[3,0,0],"s":[1,9,1]}],
            'i': [{"p":[0,8,0],"s":[7,1,1]},{"p":[0,1,0],"s":[1,7,1]},{"p":[0,0,0],"s":[7,1,1]}],
            'j': [{"p":[0,8,0],"s":[5,1,1]},{"p":[3,1,0],"s":[1,8,1]},{"p":[1,0,0],"s":[3,1,1]},{"p":[-2,2,0],"s":[1,1,1]},{"p":[-1,1,0],"s":[1,1,1]},{"p":[-3,8,0],"s":[1,1,1]}],
            'k': [{"p":[-1,5,0],"s":[3,1,1]},{"p":[-3,0,0],"s":[1,9,1]},{"p":[1,4,0],"s":[3,1,1]},{"p":[1,6,0],"s":[1,2,1]},{"p":[2,8,0],"s":[1,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,4,1]}],
            'l': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[3,0,0],"s":[1,1,1]}],
            'm': [{"p":[-3,0,0],"s":[1,8,1]},{"p":[0,0,0],"s":[1,6,1]},{"p":[3,0,0],"s":[1,8,1]},{"p":[-2,8,0],"s":[1,1,1]},{"p":[2,8,0],"s":[1,1,1]},{"p":[-1,6,0],"s":[1,2,1]},{"p":[1,6,0],"s":[1,2,1]}],
            'n': [{"p":[-3,0,0],"s":[1,9,1]},{"p":[3,0,0],"s":[1,9,1]},{"p":[-2,7,0],"s":[1,1,1]},{"p":[-1,5,0],"s":[1,2,1]},{"p":[0,4,0],"s":[1,1,1]},{"p":[1,2,0],"s":[1,2,1]},{"p":[2,1,0],"s":[1,1,1]}],
            'o': [{"p":[-3,1,0],"s":[1,7,1]},{"p":[3,1,0],"s":[1,7,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]}],
            'p': [{"p":[-3,0,0],"s":[1,8,1]},{"p":[3,5,0],"s":[1,3,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,4,0],"s":[5,1,1]}],
            'q': [{"p":[-3,1,0],"s":[1,7,1]},{"p":[3,1,0],"s":[1,7,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[2,1,0],"s":[1,1,1]},{"p":[1,1,0],"s":[1,2,1]},{"p":[0,2,0],"s":[1,3,1]}],
            'r': [{"p":[-3,0,0],"s":[1,8,1]},{"p":[3,6,0],"s":[1,2,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[2,5,0],"s":[1,1,1]},{"p":[3,5,0],"s":[1,1,1]},{"p":[-1,4,0],"s":[3,1,1]},{"p":[1,4,0],"s":[1,1,1]},{"p":[2,3,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,3,1]}],
            's': [{"p":[-3,5,0],"s":[1,3,1]},{"p":[0,8,0],"s":[5,1,1]},{"p":[3,8,0],"s":[1,1,1]},{"p":[0,4,0],"s":[5,1,1]},{"p":[3,1,0],"s":[1,3,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[-3,0,0],"s":[1,1,1]}],
            't': [{"p":[0,0,0],"s":[1,8,1]},{"p":[0,8,0],"s":[7,1,1]}],
            'u': [{"p":[3,1,0],"s":[1,8,1]},{"p":[0,0,0],"s":[5,1,1]},{"p":[-3,1,0],"s":[1,8,1]}],
            'v': [{"p":[0,0,0],"s":[1,1,1]},{"p":[1,1,0],"s":[1,2,1]},{"p":[2,3,0],"s":[1,3,1]},{"p":[3,6,0],"s":[1,3,1]},{"p":[-1,1,0],"s":[1,2,1]},{"p":[-2,3,0],"s":[1,3,1]},{"p":[-3,6,0],"s":[1,3,1]}],
            'w': [{"p":[2,0,0],"s":[1,1,1]},{"p":[1,1,0],"s":[1,2,1]},{"p":[0,3,0],"s":[1,6,1]},{"p":[3,1,0],"s":[1,8,1]},{"p":[-1,1,0],"s":[1,2,1]},{"p":[-3,1,0],"s":[1,8,1]},{"p":[-2,0,0],"s":[1,1,1]}],
            'x': [{"p":[2,2,0],"s":[1,1,1]},{"p":[1,3,0],"s":[1,1,1]},{"p":[0,4,0],"s":[1,1,1]},{"p":[3,0,0],"s":[1,2,1]},{"p":[-1,3,0],"s":[1,1,1]},{"p":[-3,0,0],"s":[1,2,1]},{"p":[-2,2,0],"s":[1,1,1]},{"p":[1,5,0],"s":[1,1,1]},{"p":[-1,5,0],"s":[1,1,1]},{"p":[2,6,0],"s":[1,1,1]},{"p":[-2,6,0],"s":[1,1,1]},{"p":[3,7,0],"s":[1,2,1]},{"p":[-3,7,0],"s":[1,2,1]}],
            'y': [{"p":[0,0,0],"s":[1,5,1]},{"p":[1,5,0],"s":[1,1,1]},{"p":[-1,5,0],"s":[1,1,1]},{"p":[2,6,0],"s":[1,1,1]},{"p":[-2,6,0],"s":[1,1,1]},{"p":[3,7,0],"s":[1,2,1]},{"p":[-3,7,0],"s":[1,2,1]}],
            'z': [{"p":[0,0,0],"s":[7,1,1]},{"p":[-3,1,0],"s":[1,1,1]},{"p":[-2,2,0],"s":[1,1,1]},{"p":[-1,3,0],"s":[1,1,1]},{"p":[0,4,0],"s":[1,1,1]},{"p":[1,5,0],"s":[1,1,1]},{"p":[2,6,0],"s":[1,1,1]},{"p":[3,7,0],"s":[1,1,1]},{"p":[0,8,0],"s":[7,1,1]}]
        };
        let posX = 0, posY = 0;
        let objects = [];
        for (let chr of input) {
            if (chr == " ") posX += 5;
            if (chr == ".") posX = 0, posY -= 11;
            if (chr in alphabet) {
                let asset = JSON.parse(JSON.stringify(alphabet[chr])); // Stop from editing alphabet assets
                for (let ob of asset) {
                    ob.p[0] += posX;
                    ob.p[1] += posY; 
                    objects.push(ob);
                }
                posX += 9; 
            }
        }
        //return objects;
        this.replaceObject(JSON.stringify(objects), true);
    }

    frameObject() {
        let selected = this.objectSelected();
        if (!selected) return alert('Please Select a object');
        let thickness = this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[0].getValue(),
            ceiling = this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[1].getValue(),
            floor = this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[2].getValue();

        if (thickness < 1) return alert('Wall Thickness must be 1 or greator');
        let pos = selected.position;
        let size = selected.scale;
        let cN = {p:[pos.x, pos.y, pos.z - (size.z / 2) - (thickness / 2)], s:[size.x + (thickness * 2), size.y, thickness]};
        this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cN), true);
        
        let cS = {p:[pos.x, pos.y, pos.z + (size.z / 2) + (thickness / 2)], s:[size.x + (thickness * 2), size.y, thickness]};
        this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cS), true);
        
        let cW = {p:[pos.x - (size.x / 2) - (thickness / 2), pos.y, pos.z], s:[thickness, size.y, size.z]};
        this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cW), true);
        
        let cE = {p:[pos.x + (size.x / 2) + (thickness / 2), pos.y, pos.z], s:[thickness, size.y, size.z]};
        this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cE), true);
        
        let cT = {p:[pos.x, pos.y + size.y, pos.z], s:[size.x + (thickness * 2), thickness, size.z + (thickness * 2)]};
        if (ceiling) this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cT), true);
        
        let cB = {p:[pos.x, pos.y - thickness, pos.z], s:[size.x + (thickness * 2), thickness, size.z + (thickness * 2)]};
        if (floor) this.hooks.editor.addObject(this.hooks.objectInstance.deserialize(cB), true);

        this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[0].setValue(10);
        this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[1].setValue(false);
        this.mainMenu.__folders['Other Features'].__folders['Frame'].__controllers[2].setValue(false);
        this.mainMenu.__folders['Other Features'].__folders['Frame'].close();
    }

    exportToObj()  {
        let object = this.hooks.editor.scene;
        let THREE = this.hooks.three;
        let output = '';
        let indexVertex = 0;
        let indexVertexUvs = 0;
        let indexNormals = 0;
        let vertex = new THREE.Vector3();
        let normal = new THREE.Vector3();
        let uv = new THREE.Vector2();
        let i, j, l, m, face = [];
        let parseMesh = function (mesh) {
            let nbVertex = 0;
            let nbNormals = 0;
            let nbVertexUvs = 0;
            let geometry = mesh.geometry;
            let normalMatrixWorld = new THREE.Matrix3();
            if (geometry instanceof THREE.Geometry) geometry = new THREE.BufferGeometry().setFromObject(mesh);
            if (geometry instanceof THREE.BufferGeometry) {
                let vertices = geometry.getAttribute('position');
                let normals = geometry.getAttribute('normal');
                let uvs = geometry.getAttribute('uv');
                let indices = geometry.getIndex();
                output += 'o ' + mesh.name + '\n';
                if (vertices !== undefined) {
                    for (i = 0, l = vertices.count; i < l; i ++, nbVertex++) {
                        vertex.x = vertices.getX(i);
                        vertex.y = vertices.getY(i);
                        vertex.z = vertices.getZ(i);
                        vertex.applyMatrix4(mesh.matrixWorld);
                        output += 'v ' + vertex.x + ' ' + vertex.y + ' ' + vertex.z + '\n';
                    }
                }
                if (uvs !== undefined) {
                    for (i = 0, l = uvs.count; i < l; i ++, nbVertexUvs++) {
                        uv.x = uvs.getX( i );
                        uv.y = uvs.getY( i );
                        output += 'vt ' + uv.x + ' ' + uv.y + '\n';
                    }
                }
                if (normals !== undefined) {
                    normalMatrixWorld.getNormalMatrix(mesh.matrixWorld);
                    for (i = 0, l = normals.count; i < l; i ++, nbNormals++) {
                        normal.x = normals.getX(i);
                        normal.y = normals.getY(i);
                        normal.z = normals.getZ(i);
                        normal.applyMatrix3(normalMatrixWorld);
                        output += 'vn ' + normal.x + ' ' + normal.y + ' ' + normal.z + '\n';
                    }
                }
                if (indices !== null) {
                    for (i = 0, l = indices.count; i < l; i += 3) {
                        for (m = 0; m < 3; m++) {
                            j = indices.getX(i + m) + 1;
                            face[m] = (indexVertex + j) + '/' + (uvs ? (indexVertexUvs + j) : '' ) + '/' + (indexNormals + j);
                        }
                        output += 'f ' + face.join(' ') + "\n";
                    }
                } else {
                    for (i = 0, l = vertices.count; i < l; i += 3) {
                        for (m = 0; m < 3; m++){
                            j = i + m + 1;
                            face[m] = (indexVertex + j) + '/' + (uvs ? (indexVertexUvs + j) : '' ) + '/' + (indexNormals + j);
                        }
                        output += 'f ' + face.join(' ') + "\n";
                    }
                }
            }
            indexVertex += nbVertex;
            indexVertexUvs += nbVertexUvs;
            indexNormals += nbNormals;
        };
        for (let i = 4; i < object.children.length; i++) if (object.children[i] instanceof THREE.Mesh) parseMesh(object.children[i]);
        this.download(output, 'model.obj', 'text/plain');
    }   

    transformMap() {
        return alert('This will be functional in a later update');
    }

    backupMap() {
        return this.hooks.editor.exportMap();
    }

    intersect(a, b) {
        return (a.minX <= b.maxX && a.maxX >= b.minX) &&
            (a.minY <= b.maxY && a.maxY >= b.minY) &&
            (a.minZ <= b.maxZ && a.maxZ >= b.minZ);
    }

    onMouseMove(event) {
        if (!window.mod.settings.objectHighlight) {
            if (window.mod.intersected) {
                window.mod.intersected.defaultMaterial.emissive.setHex(window.mod.intersected.currentHex);
                window.mod.intersected = null;
            }
            return;
        }
        if (!window.mod.hooks.three) return; //not ready yet
        let t = new window.mod.hooks.three.Vector2(event.clientX / window.innerWidth * 2 - 1, -event.clientY / window.innerHeight * 2 + 1);
        window.mod.hooks.editor.raycaster.setFromCamera(t, window.mod.hooks.editor.camera);
        let e = window.mod.hooks.editor.raycaster.intersectObjects(window.mod.hooks.editor.boundingMeshes);
        if (e.length > 0) {
            let object = e[0].object.userData.owner;
            if (window.mod.intersected != object) {
                if (window.mod.intersected) window.mod.intersected.defaultMaterial.emissive.setHex(window.mod.intersected.currentHex);
                window.mod.intersected = object;
                window.mod.intersected.currentHex = window.mod.intersected.defaultMaterial.emissive.getHex();
                window.mod.intersected.defaultMaterial.emissive.setHex(Math.random() * 0xff00000 - 0xff00000);
            }
        } else {
            if (window.mod.intersected) window.mod.intersected.defaultMaterial.emissive.setHex(window.mod.intersected.currentHex);
            window.mod.intersected = null;
        }
    }

    addControls() {
        document.getElementById("exportMap").insertAdjacentHTML('afterend', '<div id="newMap" class="bottomButton">New Map</div>');
        document.getElementById("bottomBar").insertAdjacentHTML('beforeend', '<div class="bottomPanel"><div id="spawnPlaceholder" class="bottomButton">Spawn Placeholder</div></div>');

        document.getElementById("newMap").addEventListener("click", t => {  
            confirm("Are you sure you want to reset the map?") && this.hooks.editor.clearMap();
        })
        document.getElementById("spawnPlaceholder").addEventListener("click", t => {  
            this.spawnPlaceholder();
        })
        
        window.addEventListener("keydown", t => {
            if (!this.hooks.editor.isTyping(t))
                switch (t.keyCode) {
                    case 67: //ctrl c
                        return t.ctrlKey ? this.copyObjects() : false;
                    case 86:
                        return t.ctrlKey ? this.pasteObjects() : false;
                    case 70:
                        return t.shiftKey ? this.fixHitbox() : false;
                    case 82:
                        return t.shiftKey ? this.hooks.editor.duplicateObject() : false;
                    case 80: 
                        return this.spawnPlaceholder();
                    case 192:
                        this.reflect(JSON.parse(this.hooks.editor.getMapExport()), 0);
                        break;
                }
        });
    }

    download(content, fileName, contentType) {
        //Credit to - https://stackoverflow.com/a/34156339
        let a = document.createElement("a");
        let file = new Blob([content], {type: contentType});
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    }

    degToRad(r) {
        if (!this.settings.degToRad) return r;
        return [
            r[0] * (Math.PI / 180),
            r[1] * (Math.PI / 180),
            r[2] * (Math.PI / 180),
        ];
    }
    
    copyToClipboard(str) {
        const el = document.createElement('textarea');
        el.value = str;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }

	addStyle(css) {
		let head = document.head || document.getElementsByTagName('head')[0];
		if (head) {
			let style = document.createElement("style");
			style.type = "text/css";
			style.appendChild(document.createTextNode(css));
			head.appendChild(style);
		}
	}

    loop() {
        this.checkGroup();
        
        this.hooks.editor.gridHelper.visible = this.settings.gridVisibility;
        this.hooks.editor.gridHelper.material.opacity = this.settings.gridOpacity;
    }

    removeAd() {//Sorry Sidney it blocks my second GUI
        document.body.removeChild(document.body.children[0]);
    }

    setupSettings() {
        this.defaultSettings = JSON.parse(JSON.stringify(this.settings));
        let ls = this.getSavedVal('krunker_editor_mod');
        if (ls == null) return;
        try {
            JSON.parse(ls);
        } catch (e) {
            return;
        }
        let jsp = JSON.parse(ls);
        for (let set in jsp) {
            this.settings[set] = jsp[set];
        }
    }

    resetSettings() {
        for (let set in this.settings) {
            console.log(set, this.defaultSettings[set]);
            this.setSettings(set, this.defaultSettings[set]);
        }
        this.gui.updateDisplay();
        alert('Some settings require a refresh take effect');
    }

    setSettings(k, v) {
        this.settings[k] = v;
        this.saveVal('krunker_editor_mod', JSON.stringify(this.settings));
    }

    getSavedVal(t) {
        const r = "undefined" != typeof Storage;
        return r ? localStorage.getItem(t) : null;
    }

    saveVal(t, e) {
        const r = "undefined" != typeof Storage;
        r && localStorage.setItem(t, e);
    }

    addGui() {
        this.addStyle(`#gui { position: absolute; top: 2px; left: 2px }`);
        
        this.gui = new dat.GUI;
        this.gui.domElement.id = 'gui';
        
        let options = {rotation: 0};
        options.json = (() => this.jsonInput());
        options.file = (() => this.jsonInput(true));
        options.textGen = (() => this.textToObjects());
        options.create = (() => this.copyObjects(false, true));
        options.stop = (() => this.stopGrouping());
        options.stopAll = (() => this.stopGrouping(true));
        options.exportObj = (() => this.exportObjects());
        options.exportFull = (() => this.exportObjects(true));
        options.copy = (() => this.copyObjects());
        options.cut = (() => this.copyObjects(true));
        options.paste = (() => this.pasteObjects());
        options.texture = "DEFAULT";
        options.scaleMapX = 1.0;
        options.scaleMapY = 1.0;
        options.scaleMapZ = 1.0;
        options.scaleMap = (() => this.scaleMap());
        options.transformMap = (() => this.transformMap());
        options.colorizeR = (() => this.colorizeMap(false, false, true));
        options.colorizeG = (() => this.colorizeMap(false, true));
        options.colorizeI = (() => this.colorizeMap(prompt("Input colors. (Seperate using a comma)", "")));
        options.voxelConvert = (() => this.convert());
        options.voxelImport = (() => this.convert(true)); 
        options.editColor = (() => this.editGroup('color', prompt("Input color", "")));
        options.reset = (() => this.resetSettings());
        options.frameObject = (() => this.frameObject());
        options.frameThickness = 10;
        options.frameCeiling = false;
        options.frameFloor = false;
        options.exportToObj = (() => this.exportToObj());
        options.reflectDir = 0;
        options.reflectMap = (() => this.reflectMap())
        
        this.mainMenu = this.gui.addFolder("Map Editor Mod v" + this.version);
        this.mainMenu.open();
        
        this.assetMenu = this.mainMenu.addFolder("Assets");
        let assets = localStorage.getItem('krunk_assets') ? JSON.parse(localStorage.getItem('krunk_assets')) : {};
        
        this.assetMenu.add(options, "rotation", 0, 359, 1).name("Rotation").onChange(t => {this.rotation = t})  ;
        this.assetMenu.add(options, "json").name("Json Import");
        this.assetMenu.add(options, "file").name("File Import");
        this.assetFolder(assets, this.assetMenu);
        
        let groupingMenu = this.mainMenu.addFolder("MultiObject");
        //groupingMenu.open()
        groupingMenu.add(options, "create").name("Create Group");
        groupingMenu.add(options, "stop").name("Stop Group"); 
        groupingMenu.add(options, "stopAll").name("Stop All Groups"); 
        groupingMenu.add(options, "copy").name("Copy");
        groupingMenu.add(options, "cut").name("Cut");
        groupingMenu.add(options, "paste").name("Paste");
        
        let editMenu = groupingMenu.addFolder("Edit");
        let textures = {Default: "DEFAULT", Wall: "WALL", Dirt: "DIRT", Floor: "FLOOR", Grid: "GRID", Grey: "GREY", Roof: "ROOF", Flag: "FLAG", Grass: "GRASS", Check: "CHECK"};
        editMenu.add(options, "texture").options(textures).name("Texture").listen().onChange(t => {
            this.editGroup('texture', t);
        });
        editMenu.add(options, "editColor").name("Color");
        
        let exportMenu = groupingMenu.addFolder("Export");
        
        exportMenu.add(options, "exportObj").name("Objects");
        exportMenu.add(options, "exportFull").name("Full");         
        
        let otherMenu = this.mainMenu.addFolder("Other Features");
        
        let colorizeMenu = otherMenu.addFolder("Colorize");
        colorizeMenu.add(options, "colorizeR").name("Random"); 
        colorizeMenu.add(options, "colorizeG").name("Gold");
        colorizeMenu.add(options, "colorizeI").name("Input");
        
        let scaleMapMenu = otherMenu.addFolder("Scale Map");
        scaleMapMenu.add(options, "scaleMapX").name("X"); 
        scaleMapMenu.add(options, "scaleMapY").name("Y"); 
        scaleMapMenu.add(options, "scaleMapZ").name("Z");     
        scaleMapMenu.add(options, "scaleMap").name("Scale");
        
        let reflectMenu = otherMenu.addFolder("Reflect Map");
        reflectMenu.add(options, "reflectDir").options({X: 0, Y: 1, Z: 2}).name("Direction"); 
        reflectMenu.add(options, "reflectMap").name("Reflect");
        
        let frameMenu = otherMenu.addFolder("Frame");
        frameMenu.add(options, "frameThickness").name("Wall Thickness"); 
        frameMenu.add(options, "frameCeiling").name("Has Ceiling"); 
        frameMenu.add(options, "frameFloor").name("Has Floor"); 
        frameMenu.add(options, "frameObject").name("Frame It");  
        
        let voxelsMenu = otherMenu.addFolder('Voxels');
        voxelsMenu.add(this.settings, "mergeVoxels").name("Merge").onChange(t => {this.setSettings('mergeVoxels', t)});
        voxelsMenu.add(options, "voxelConvert").name("Convert");
        voxelsMenu.add(options, "voxelImport").name("Import");
        
        otherMenu.add(options, "textGen").name("Text Generator");
        otherMenu.add(options, "exportToObj").name("Export To Obj");
        
        /*
        let transformMenu = otherMenu.addFolder("Transform Map");
        transformMenu.add(options, "transformMap").name("Transform");
        */
        
        let settingsMenu = this.mainMenu.addFolder('Settings');
        settingsMenu.add(this.settings, "degToRad").name("Anti Radians").onChange(t => {this.setSettings('degToRad', t)});
        settingsMenu.add(this.settings, "backupMap").name("Auto Backup").onChange(t => {this.setSettings('backupMap', t)});
        settingsMenu.add(this.settings, "antiAlias").name("Anti-aliasing").onChange(t => {this.setSettings('antiAlias', t), alert("This change will occur after you refresh")});   
        settingsMenu.add(this.settings, "highPrecision").name("High Precision").onChange(t => {this.setSettings('highPrecision', t), alert("This change will occur after you refresh")});
        settingsMenu.add(this.settings, "objectHighlight").name("Hightlight").onChange(t => {this.setSettings('objectHighlight', t)});

        let gridMenu = settingsMenu.addFolder('Grid');
        gridMenu.add(this.settings, "gridVisibility").name("Visible").onChange(t => {this.setSettings('gridVisibility', t)});      
        gridMenu.add(this.settings, "gridOpacity", 0.05, 1, 0.05).name("Opacity").onChange(t => {this.setSettings('gridOpacity', t)});
        gridMenu.add(this.settings, "gridSize").name("Size").onChange(t => {this.setSettings('gridSize', t)});      
        gridMenu.add(this.settings, "gridDivisions").name("Divisions").onChange(t => {this.setSettings('gridDivisions', t)}); 
        
        let placeholderMenu = settingsMenu.addFolder('Placeholder');
        placeholderMenu.add(this.settings, "phOpacity", 0, 1, .1).name("Opacity").onChange(t => {this.setSettings('phOpacity', t)});
        placeholderMenu.addColor(this.settings, "phEmissive",).name("Emissive").onChange(t => {this.setSettings('phEmissive', t)});
        placeholderMenu.addColor(this.settings, "phColor").name("Color").onChange(t => {this.setSettings('phColor', t)});

        settingsMenu.add(options, "reset").name("Reset");        
    }

    assetFolder(assets, menu) {
        let options = {};
        for (let ob in assets) {
            if (!Array.isArray(assets[ob])) {
                let folder = menu.addFolder(ob);
                this.assetFolder(assets[ob], folder);
            } else {
                options[ob] = (() => this.replaceObject(JSON.stringify(assets[ob])));
                menu.add(options, ob).name(ob + " [" + assets[ob].length + "]");
            }
        }
    }

    onLoad() {
        this.setupSettings();
        this.removeAd();
        this.addGui();
        this.addControls();
        window.onbeforeunload = function() {return true};
    }
}

GM_xmlhttpRequest({
    method: "GET",
    url: `${document.location.origin}/js/editor.js`,
    onload: res => {
        let code = res.responseText;
        code = code.replace(/String\.prototype\.escape=function\(\){(.*)\)},(Number\.)/, "$2")
            .replace('("Sky Color").listen().onChange', '("Sky Color").onChange')
            .replace('("Ambient Light").listen().onChange', '("Ambient Color").onChange')
            .replace('("Light Color").listen().onChange', '("Light Color").onChange')
            .replace('("Fog Color").listen().onChange', '("Fog Color").onChange')
            .replace(/((\w+).boundingNoncollidableBoxMaterial=new .*}\);)const/, '$1 window.mod.hooks.objectInstance = $2;const')
            //.replace(/(\w+).init\(document.getElementById\("container"\)\)/, '$1.init(document.getElementById("container")), window.mod.hooks.editor = $1')
            .replace(/this\.transformControl\.update\(\)/, 'this.transformControl.update(),window.mod.hooks.editor = this,window.mod.loop()')
            .replace(/\[\],(\w+).open\(\),/, '[],$1.open(),window.mod.hooks.gui=$1,')
            .replace(/(Object\.assign\(this\.mapConfig,\w+\))/, '$1, window.mod.hooks.gui.updateDisplay(),this.scene.background = new window.mod.hooks.three.Color(this.mapConfig.sky),this.skyLight.color.set(this.mapConfig.light),this.scene.fog.color.set(this.mapConfig.fog),this.scene.fog.far = this.mapConfig.fogD')
            .replace(/initScene\(\){this\.scene=new (\w+).Scene,/, 'initScene(){this.scene=new $1.Scene,window.mod.hooks.three = $1,')
            .replace(/{(\w+)\[(\w+)\]\=(\w+)}\);this\.objConfigOptions/, '{$1[$2]=$2 == "rot" ? window.mod.degToRad($3) : $3});this.objConfigOptions')
            .replace('{this.removeObject()}', '{window.mod.objectSelected(true) ? window.mod.removeGroup() : this.removeObject()}')
            .replace('{this.duplicateObject()}', '{window.mod.objectSelected(true) ? window.mod.duplicateGroup() : this.duplicateObject()}')
            .replace(/antialias:!1/g, 'antialias:window.mod.settings.antiAlias ? 1 : !1')
            .replace(/precision:"mediump"/g, 'precision:window.mod.settings.highPrecision ? "highp": "mediump"')
            .replace(/GridHelper\(100,10\)/, 'GridHelper(window.mod.settings.gridSize, window.mod.settings.gridDivisions)')
            
            //Object Adding Optimization (Added to editor thx sidney)
            //.replace(/addObject\((\w+)\){/, 'addObject($1, multi=false){')
            //.replace(/(this\.scene\.add\(.+\.arrowHelper\)),(this\.attachTransform\(.+\.boundingMesh\))/, '$1; if(!multi)$2')
            //.replace(/this\.addObject\((\w+\.deserialize\(\w+\))\);/, 'this.addObject($1, true);')
        
            //Object Removing Optimization
            .replace(/removeObject\((\w+)\){/, 'removeObject($1, multi=false){')
            .replace(/(this\.scene\.remove\(.+\.arrowHelper\)),(this\.hideTransform\(\))/, '$1; if(!multi)$2')
            .replace(/(this\.removeObject\(this\.objInstances\[0\])\)/, '$1, true)')
            .replace(/(},xyzKeys:)/, '\nthis.hideTransform();$1')
            
            .replace(/((this\.container\.addEventListener)\("mousedown")/, '$2("mousemove", window.mod.onMouseMove),$1')
            .replace(/((\w+)=>{)(this\.importMap\(\))/, '$1$2.shiftKey ? window.mod.importMapFile() : $3')
            .replace(/((\w+)=>{)(this\.exportMap\(\))/, '$1 if($2.shiftKey)window.mod.copyToClipboard(this.getMapExport()); $3')
            
        GM_xmlhttpRequest({
            method: "GET",
            url: `${document.location.origin}/editor.html`,
            onload: res => {
                let html = res.responseText;
                html = html.replace(' src="js/editor.js">', `>${Mod.toString()}\nwindow.mod = new Mod(${JSON.stringify(GM.info.script.version)});\n${code.toString()}`);
                document.open();
                document.write(html);
                document.close();
            }
        })
    }
})
