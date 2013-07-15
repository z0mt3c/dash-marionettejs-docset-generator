var options = {
    workDir: 'target',
    docSetName: 'marionettejs.docset',
    contentsPath: 'Contents',
    documentPath: 'Contents/Resources/Documents',
    marionetteRepo: 'https://github.com/marionettejs/backbone.marionette.git',
    marionetteTarget: 'marionette-js-repo',
    marionetteDocsFolder: 'docs'
};

var Sequelize = require('sequelize'), _ = require('underscore'), md = require("marked"), q = require('q'), fs = require('fs'), path = require('path'), utils = require('./utils'), mkdirp = require('mkdirp'), process = require('child_process');

// Delete old work dir
if (fs.existsSync(options.workDir)) {
    utils.deleteFolderRecursive(options.workDir);
    console.log('Working Directory deleted.')
}

// Prepare structure
mkdirp(path.join(options.workDir, options.docSetName, options.documentPath, 'css'), function (err) {
    if (err) {
        console.error(err);
    } else {
        console.log('Docset directories created.');
    }
});

// Checkout marionettejs
var command = 'git clone ' + options.marionetteRepo + ' ' + path.join(options.workDir, options.marionetteTarget);
var exec = process.exec(command, function (error, stdout, stderr) {
    console.log(stdout);
    processDocumentation()
    copyFiles();
});

function copyFiles() {
    fs.createReadStream('index.html').pipe(fs.createWriteStream(path.join(options.workDir, options.docSetName, options.documentPath, 'index.html')));
    fs.createReadStream('github.css').pipe(fs.createWriteStream(path.join(options.workDir, options.docSetName, options.documentPath, 'css', 'github.css')));
    fs.createReadStream('Info.plist').pipe(fs.createWriteStream(path.join(options.workDir, options.docSetName, options.contentsPath, 'Info.plist')));
    fs.createReadStream('icon.png').pipe(fs.createWriteStream(path.join(options.workDir, options.docSetName, 'icon.png')));
}

function processDocumentation() {
    var items = [];

    var files = fs.readdirSync(path.join(options.workDir, options.marionetteTarget, options.marionetteDocsFolder));
    _.each(files, function (file) {
        items = _.union(items, processDocumentationFile(file));
    });

    createSearchIndex(items);
}

function convertToAnchorName(text) {

    var name = text.toLowerCase()
        .replace(/(<[^>]*>|')/g, '')
        .replace(/"/g,'')
        .replace('&#39;','')
        .replace(/[:*]/g,'')
        .replace(/&quot;/g,'')
        .replace(/[_\-\s]+/g, '-')
        .replace(/['\.]/g, '')
        .replace('-39-', '')
        .replace('/','');

    return name;
}
function processDocumentationFile(file) {
    var items = [];

    var fileName = file.substring(0, file.length - 3);
    var targetFile = path.join(options.workDir, options.docSetName, options.documentPath, fileName + '.html');
    var sourceFile = path.join(options.workDir, options.marionetteTarget, options.marionetteDocsFolder, file);
    var content = fs.readFileSync(sourceFile, 'utf-8');

    content = md(content);

    var regex = /<h1>Marionette\.([^<]*)/g;
    var match = regex.exec(content);

    if (match && match.length >= 1 && match[1]) {
        items.push({name: match[1], type: 'Class', path: fileName + '.html' })
    }

    regex = /<h1>Marionette functions</g;

    if (regex.exec(content)) {
        regex = /<h2>Marionette\.([^<]*)/g;

        while (match = regex.exec(content)) {
            var name = convertToAnchorName(match['1']);
            items.push({name: match[1], type: 'Function', path: fileName + '.html#marionette'+name })
        }
    }

    content = content.replace(/(<h[123])>(.*)<\/h/g, function () {
        var name = convertToAnchorName(arguments['2']);
        return arguments['1'] + '><a name="' + name + '"></a>' + arguments['2']+"</h";
    });

    fs.writeFileSync(targetFile, "<!DOCTYPE html>\n<html>\n<head>\n<link href=\"css/github.css\" rel=\"stylesheet\" type=\"text/css\">\n<meta charset=\"utf-8\" />\n</head>\n<body>\n" + content + "\n</body>\n</html>");
    return items;
}


function createSearchIndex(items) {
    var sqlitePath = path.join(options.workDir, options.docSetName, options.documentPath, '..', 'docSet.dsidx');

    var seq = new Sequelize('database', 'username', 'password', {
        dialect: 'sqlite',
        storage: sqlitePath
    });

    var SearchIndex = seq.define('searchIndex', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING
        },
        type: {
            type: Sequelize.STRING
        },
        path: {
            type: Sequelize.STRING
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });

    SearchIndex.sync().success(function () {
        console.log('success');
        _.each(items, function (item) {
            var searchItem = SearchIndex.build({
                name: item.name,
                type: item.type,
                path: item.path
            });
            searchItem.save();
        });
    });
}
