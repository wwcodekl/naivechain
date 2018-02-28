'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

//#1: Block structure

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

//#4: Storing the blocks

//#7: Controlling the node

var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

//#3: Generating a block


var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

//#2: Block hash

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

//#5: Validating the integrity of blocks

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};

//#6: Choosing the longest chain

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
