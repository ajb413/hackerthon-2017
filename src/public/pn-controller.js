// UI counters
let password = '';
let status = 'idle';
let jobs = 0;
let totalJobs = 0;
let nodes = 0;
let time = 0;
let timer = null;
let BruteForce;

// UI DOM elements
let passwordElement = document.getElementById('password');
let statusElement = document.getElementById('status');
let jobsElement = document.getElementById('jobs');
let totalJobsElement = document.getElementById('totalJobs');
let nodesElement = document.getElementById('nodes');
let timeElement = document.getElementById('time');

// PubNub
const parallelComputeChannel = "parallel-compute";
const bruteForceChannel = "brute-force";
const pubKey = "pub_key";
const subKey = "sub_key";
const uuid = PubNub.generateUUID();

pubnub = new PubNub({
    "publishKey": pubKey,
    "subscribeKey": subKey,
    "uuid": uuid
});

pubnub.addListener({
    "status": function(statusEvent) {
        if (statusEvent.category === "PNConnectedCategory") {
            // publishStatus("ready"); // auto start task processing
            console.log("PN connection established");
        }
    },
    "message": function(message) {
        handleMessage(message);
    }
});

pubnub.subscribe({
    "channels": [bruteForceChannel]
});

function handleMessage(message) {
    message = message.message;

    // For incoming tasks assinged to this node
    if (message.type === "BruteForce" &&
        message.uuid === uuid &&
        message.id &&
        message.job_params &&
        message.task_params) {

        // If this is a new job, reset the timer
        if (message.job_params.password !== password) {
            clearInterval(timer);
            setTimer(message.job_params.start);
        }

        // reset all of the UI counters
        password = message.job_params.password;
        nodes = Object.keys(message.job_params.node_uuids).length;
        totalJobs = message.job_params.done_jobs;
        status = "busy";
        updateStatus();

        // Tell the manager this node is busy
        publishStatus(status, "processing", message.id);

        return Promise.resolve(message)
        .then((message) => {
            return new Promise((resolve) => {

                // Do the task in a web worker
                BruteForce = new Worker('brute-force.js');

                BruteForce.postMessage({
                    "crack": true, // use the crack method in the worker
                    "message": message
                });

                BruteForce.onmessage = function(event) {
                    resolve(event.data);
                };

            });
        })
        .then((result) => {
            // Task is complete, turn of the web worker
            if (BruteForce) BruteForce.terminate();
            BruteForce = undefined;

            // Set the UI counters
            totalJobs = message.job_params.done_jobs + 1;
            jobs++;
            status = "ready";

            // Tell the manager this node is ready for a new task
            publishStatus(status, "complete", message.id, result);

            // If Job is complete by this task, halt all nodes
            if (result) {
                publishHalt();
            }

            updateStatus();
        });
    }

    // When a node has completed the job, halt all nodes
    if (message.type === "halt") {
        if (BruteForce) BruteForce.terminate();
        BruteForce = undefined;
        status = 'idle';
        jobs = 0;
        totalJobs = 0;
        nodes = 0;
        time = 0;
        clearInterval(timer);
    }
}

function publishStatus(userStatus, taskStatus, taskId, result) {
    let publishConfig = {
        "channel": parallelComputeChannel,
        "message": {
            "type": "status",
            "uuid": uuid,
            "id": taskId,
            "task_status": taskStatus,
            "user_status": userStatus,
            "result": result
        }
    };
    pubnub.publish(publishConfig);
}

function publishHalt() {
    let publishConfig = {
        "channel": bruteForceChannel,
        "message": {
            "type": "halt"
        }
    };
    pubnub.publish(publishConfig);
}

function updateStatus() {
    passwordElement.innerText = password;
    statusElement.innerText = status;
    jobsElement.innerText = jobs;
    totalJobsElement.innerText = totalJobs;
    nodesElement.innerText = nodes;
    timeElement.innerText = time;
}

function setTimer(startTime) {
    function update() {
        time = Math.floor((Date.now() - startTime) / 1000);
        updateStatus();
    };

    update();

    timer = setInterval(update, 1000);
}

let userReady = document.getElementById('ready');
userReady.onclick = function(e) {
    publishStatus("ready");
    status = "ready";
    updateStatus();
};