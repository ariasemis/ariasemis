const fs = require('fs');
const { promisify } = require('util');
const { Octokit } = require('@octokit/rest');
const { render } = require('svg-term');
const termSchemes = require('term-schemes');
const SVGO = require("svgo");

const TEMPLATE_FILENAME = 'template.txt';
const TEMPLATE_PLACEHOLDER = '## PLACEHOLDER ##';
const TARGET_TIME = 175.9338205;
const TARGET_FILENAME = 'session.svg';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);


function mergeObj(first, second) {
    var obj = {};
    
    for (var prop in first) 
        if (first.hasOwnProperty(prop))
            obj[prop] = first[prop];

    for (var prop in second)
        if (second.hasOwnProperty(prop))
            obj[prop] = !!obj[prop] ? obj[prop] + second[prop] : second[prop];

    return obj
}

// TODO: replace with authenticated user repos
function getGithubRepos(octo, username) {
    return octo.repos
        .listForUser({ username })
        .then(response => response.data);
}

function getGithubRepoLangs(octo, repo) {
    return octo.repos
        .listLanguages({ owner: repo.owner.login, repo: repo.name })
        .then(response => response.data);
}

function getGithubLangs(octo, username) {
    console.log('fetch github langs');

    return getGithubRepos(octo, username)
        .then(repos => Promise.all(
            repos.map(r => getGithubRepoLangs(octo, r))
        ))
        .then(nested => nested.reduce((prev, curr) => mergeObj(prev, curr)));
}

function calculateLangSize(data) {
    return Object.values(data).reduce((x, y) => x + y);
}

function calculateLangUsage(data) {
    const result = [];
    const size = calculateLangSize(data);
    
    for (var prop in data) {
        if (data.hasOwnProperty(prop)) {
            var percent = data[prop] * 100 / size;
            result.push([prop, percent]);
        }
    }

    return result;
}

function drawLangUsage(data) {
    return data
        .sort((a, b) => b[1] - a[1])
        .map(x => {
            var str = `${x[0].padEnd(12)}: `;
            for (var i = 0; i < x[1]; i++) {
                str += '#';
            }
            return str;
        });
}

function createCast(data) {
    console.log('generate session cast');

    const text = data
        .map(x => [TARGET_TIME, "o", x + '\r\n'])
        .map(x => JSON.stringify(x))
        .join('\r\n');
    
    return readFile(TEMPLATE_FILENAME, 'utf8')
        .then(content => content.replace(TEMPLATE_PLACEHOLDER, text));
}

function writeSvg(cast) {
    console.log('writing svg file');

    return readFile('theme.js')
        .then(theme => {
            const raw = String(theme);
            const scheme = termSchemes.hyper(raw, { filename: 'foo' });

            const svg = render(cast, {
                cursor: true,
                theme: scheme
            });
            
            const svgo = new SVGO({
                plugins: [{ collapseGroups: false }]
            });
            
            return svgo.optimize(svg);
        })
        .then(svg => writeFile(TARGET_FILENAME, svg.data));
}

// run

const octokit = new Octokit(); // TODO: auth: "secret123"

getGithubLangs(octokit, 'ariasemis')
    .then(langs => calculateLangUsage(langs))
    .then(langs => drawLangUsage(langs))
    .then(langs => createCast(langs))
    .then(cast => writeSvg(cast));
