# Mako Master

Mako-Master is an open source, simple, private [PaaS](https://en.wikipedia.org/wiki/Platform_as_a_service) you can run yourself. It's like Heroku, but it runs on machine instances you control with minimal system requirements. For public cloud environments like AWS, Azure, and BlueMix we recommend using the built in offerings.

Mako Master is designed to make it easier to manage Service Oriented Architectures in the wild. It's born out of years of experince running and administering SOAs with other tools.

Mako Master is an SOA itself. All components speak to each other via a well-defined API, so you're free to replace bits if you like. Mako Master is designed to work with [Mako Minion](https://github.com/makolabs/mako-minion), which does the work of routing the web requests and runing the proceses. One Mako Master instance controls many Mako Minion instances.

The way it works is:

1. You run one or more Mako minions on different servers.
2. You git push your code to Mako-Master.
3. You tell Mako-Master how many of each of your services you want to run, how they should be started, and where people look for them.

Mako-Master takes care of the rest, getting the code to the minions, setting up the code, routing the http traffic, respawning instances if they die, re-allocating the jobs if a minion goes down.

#Installation

npm:

    npm install -g mako-master

git:

    git clone https://github.com/makolabs/mako-master
    npm install

Port 4000 and 4001 will need to be accessible by the minion to check in and fetch code.

If you install globally, mako-master will look for manifests and store repositories in the directory it's run from.

#Running it

Configuration paramaters are passed in via environment variables. eg:

MASTER_PASS=masterpassword MASTER_HOST=localhost MINION_PASS=minionpassword node index.js

If they're not present, a default will be substituted.
- MINION_PASS is the password that mako-master will use to authenticate itself to the Mako minions.
- MASTER_HOST is the fqdn or IP that the Mako minions can use to reach the mako-master.
- MASTER_PASS is the password the Mako minions will use to authenticate with mako-master.

The manifest is one or more JSON files in the manifest directory. An example is:

```json
    {
      "beep": {
        "instances": "*",
        "load": 1,
        "routing": {
          "domain": "beep.example.com"
        },
        "opts": {
          "setup": [
            "npm",
            "install"
          ],
          "command": [
            "node",
            "server.js"
          ],
          "commit": "8b7243393950e0209c7a9346e9a1a839b99619d9",
          "env": {
            "PORT": "RANDOM_PORT"
          }
        }
      }
    }
```

Variables of note are:
- instances: How many instances of the thing you want to be running at once. Substituting the character '*' means the thing will run on all available minions, regardless of how many there are.
- load: How 'heavy' the process is relative to your other processes. This is used when calculating which minion to designate a task to. So, a process with a load of 0.5 will be half as 'heavy' as something with a load of 1.0
- routing: These are passed through to the nginx routing layer.
  - domain: The fqdn that requests to this process will be directed at. Allows nginx to proxy the request to the right place.
  - method: The method nginx should use to allocate requests to upstream servers. Defaults to least_conn. Info here: http://wiki.nginx.org/HttpUpstreamModule#Directives
- env: Any environment variables you want to be in place when Mako minion executes the process
  - PORT: Port is required for the nginx routing layer to know where to send requests. Substituting the string 'RANDOM_PORT' will choose a free port on the system between 8000 and 9000.

#Getting your code into it

mako-master starts a git server on port 4001. Just push to it!

    git push http://git:shortfin@localhost:4001/beep master

Authenticate with whatever you set in the MASTER_PASS environment variable. Here we've called the repo 'beep'. Each repo needs to have a unique name so you can refer to it later.
