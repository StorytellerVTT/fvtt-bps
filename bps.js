let socket;
let selectedUserId;

Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule("boulderparchmentshears");
    socket.register("startBPS", startBPS);
    socket.register("otherUserBPS", otherUserBPS);
    socket.register("deleteMessageBPS", deleteMessageBPS);
    socket.register("updateMessageBPS", updateMessageBPS)
});

Hooks.on("createChatMessage", async (msg) => {
    if (msg.content !== "bps" || game.user.id !== msg.user.id) return;
    let gmOnline = false;
    await game.users.forEach(user => {
        if (user.active && user.isGM) {
            gmOnline = true;
            return;
        }
    })
    if (gmOnline) {
        await socket.executeAsUser("startBPS", msg.user.id, msg);
        await socket.executeAsGM("deleteMessageBPS", msg.id);
    }
    else {
        ChatMessage.create({ speaker: { alias: "Boulder, Parchment, Shears!" }, content: "Boulder, Parchment, Shears! only works when a GM is online.", whisper: [msg.user.id] });
    }
});

Hooks.on('renderChatMessage', async (msg, [html], messageData) => {
    if (msg.content.includes('<select id="bpsSelectUser">') && game.user.id === msg.user.id) {
        const selectElement = html.querySelector('#bpsSelectUser');
        const startButton = html.querySelector('.bpsStartButton');

        if (selectElement && startButton) {
            startButton.addEventListener('click', async (event) => {
                const selectedUserId = selectElement.value; // Get the selected value

                // Update the message content with the buttons
                Hooks.once("updateChatMessage", (msg) => {
                    const newMessage = game.messages.get(msg.id);
                    const parser = new DOMParser();
                    const newHtml = parser.parseFromString(newMessage.content, 'text/html');
                    addSelectionListeners(msg.id, newHtml);
                });
                await socket.executeAsGM("updateMessageBPS", msg.id, { content: generateBPSButtons(250) });
                await socket.executeAsUser("otherUserBPS", selectedUserId, selectedUserId, msg);
            });
        }
    }
});

Hooks.on('renderChatMessage', async (msg, [html], messageData) => {
    if (!msg.flags.boulderparchmentshears) return;
    addSelectionListeners(msg.id, html);
});


function addSelectionListeners(messageid, html) {
    const boulderButton = html.querySelector('.bpsButton[data-choice="Boulder"]');
    const parchmentButton = html.querySelector('.bpsButton[data-choice="Parchment"]');
    const shearsButton = html.querySelector('.bpsButton[data-choice="Shears"]');
    const shootButton = html.querySelector('.bpsShootButton');
    const setSelectedChoiceBackgroundColor = (selectedChoice) => {
        const buttonElements = {
            Boulder: html.querySelector('.bpsButton[data-choice="Boulder"]'),
            Parchment: html.querySelector('.bpsButton[data-choice="Parchment"]'),
            Shears: html.querySelector('.bpsButton[data-choice="Shears"]'),
        };

        for (const choice in buttonElements) {
            if (buttonElements.hasOwnProperty(choice)) {
                buttonElements[choice].style.backgroundColor = choice === selectedChoice ? 'rgb(60, 60, 60)' : '';
            }
        }
    };
    let selectedChoice;
    if (boulderButton && parchmentButton && shearsButton) {
        boulderButton.addEventListener('click', () => {
            // Disable boulder, enable Parchment and Shears
            boulderButton.disabled = true;
            parchmentButton.disabled = false;
            scissorsButton.disabled = false;
            shootButton.disabled = false;
            selectedChoice = "boulder";
            setSelectedChoiceBackgroundColor('boulder');
        });

        parchmentButton.addEventListener('click', () => {
            // Disable Parchment, enable boulder and Shears
            boulderButton.disabled = false;
            parchmentButton.disabled = true;
            scissorsButton.disabled = false;
            shootButton.disabled = false;
            selectedChoice = "parchment";
            setSelectedChoiceBackgroundColor('Parchment');
        });

        scissorsButton.addEventListener('click', () => {
            // Disable Shears, enable boulder and Parchment
            boulderButton.disabled = false;
            parchmentButton.disabled = false;
            scissorsButton.disabled = true;
            shootButton.disabled = false;
            selectedChoice = "scissors";
            setSelectedChoiceBackgroundColor('Shears');
        });
    }
    if (shootButton) {
        shootButton.disabled = true;
        shootButton.addEventListener('click', () => {
            const message = game.messages.get(messageid);
            const linkedMessage = game.messages.get(message.flags.boulderparchmentscissors.linkedMessage);
            if (!linkedMessage.flags.boulderparchmentscissors.ready) {
                socket.executeAsGM("updateMessageBPS", message.id, { content: "You chose <strong>" + selectedChoice + "</strong>! Waiting for " + linkedMessage.user.name + " to make their choice...", flags: { boulderparchmentscissors: { ready: true, choice: selectedChoice } } });
            }
            else {
                const linkedMessageChoice = linkedMessage.flags.boulderparchmentscissors.choice;
                const messageChoice = selectedChoice
                const cardTitle = message.user.name + " and " + linkedMessage.user.name + " played Boulder, Parchment, Shears!";
                let result = message.user.name + " played <strong>" + messageChoice + "</strong>!<br><br>" + linkedMessage.user.name + " played <strong>" + linkedMessageChoice + "</strong>!<br><hr />";
                if (messageChoice === linkedMessageChoice) {
                    result += "<strong>It's a tie!</strong>";
                }
                else if ((messageChoice === "scissors" && linkedMessageChoice === "parchment") || (messageChoice === "parchment" && linkedMessageChoice === "boulder") || (messageChoice === "boulder" && linkedMessageChoice === "scissors")) {
                    result += "<strong>" + message.user.name + " won! </strong>";
                }
                else {
                    result += "<strong>" + linkedMessage.user.name + " won! </strong>";
                }
                ChatMessage.create({ speaker: { alias: "Boulder, Parchment, Shears!" }, content: `<div style="text-align: center;" class="chat-card"><header class="card-header flexrow"><h3>` + cardTitle + `</h3></header><section class="card-content">` + result + `</section></div>` })
                socket.executeAsGM("deleteMessageBPS", message.id);
                socket.executeAsGM("deleteMessageBPS", linkedMessage.id);
            }
        })
    }
}


function deleteMessageBPS(messageid) {
    const message = game.messages.get(messageid);
    message.delete();
}

function startBPS(message) {
    const activeUsers = game.users.filter(user => user.active && user.id !== message.user.id);
    if (activeUsers.length === 0) {
        ChatMessage.create({ speaker: { alias: "Boulder, Parchment, Shears!" }, content: "No other active users found.", whisper: [message.user.id] });
        return;
    }
    const dropdownOptions = activeUsers.map(user => ({
        label: user.name,
        value: user.id
    }));
    const dropdownHtml = `<select id="bpsSelectUser">
      ${dropdownOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
    </select>`;
    const startButtonHtml = `<button class="bpsStartButton">Start</button>`;
    const contentHtml = `
    <div style="text-align: center;">
        Select a user to play Boulder, Parchment, Shears!
        <p>
            <div style="margin: 0 auto; display: inline-block;">
                ${dropdownHtml}
            </div>
        </p>
        <div>${startButtonHtml}</div>
    </div>
    `;
    ChatMessage.create({ speaker: { alias: "Boulder, Parchment, Shears!" }, content: contentHtml, whisper: [message.user.id] });
}

async function otherUserBPS(userid, message) {
    const initiatorsName = game.users.get(message.user).name;
    Hooks.once("createChatMessage", (msg) => {
        socket.executeAsGM("updateMessageBPS", message._id, { content: "You're playing Boulder, Parchment, Shears with <strong>" + msg.user.name + "</strong>!\nMake your choice and click \"<strong>Shoot!</strong>\"\n" + game.messages.get(message._id).content, flags: { boulderparchmentscissors: { linkedMessage: msg.id, ready: false } } });
    });
    await ChatMessage.create({ speaker: { alias: "Boulder, Parchment, Shears!" }, content: "<strong>" + initiatorsName + "</strong> wants to play Boulder, Parchment, Shears with you!\nMake your choice and click \"<strong>Shoot!</strong>\"\n" + generateBPSButtons(250), whisper: [userid], flags: { boulderparchmentscissors: { linkedMessage: message._id, ready: false } } });
}

function generateBPSButtons(width) {
    // Calculate the button size based on 30% of the width
    const buttonSize = `${(width * 0.3)}px`;

    // Create HTML for the three buttons with CSS styles
    const buttonStyle = `width: ${buttonSize}; height: ${buttonSize}; background-size: contain; background-repeat: no-repeat;`;

    const buttonsContainerStyle = `
                    display: flex;
                    justify-content: center; /* Center horizontally */
                `;

    const boulderButton = `<button class="bpsButton" data-choice="Boulder" style="${buttonStyle} background-image: url(modules/boulderparchmentscissors/vectors/Boulder.png);"></button>`;
    const parchmentButton = `<button class="bpsButton" data-choice="Parchment" style="${buttonStyle} background-image: url(modules/boulderparchmentscissors/vectors/Parchment.png);"></button>`;
    const scissorsButton = `<button class="bpsButton" data-choice="Shears" style="${buttonStyle} background-image: url(modules/boulderparchmentscissors/vectors/Shears.png);"></button>`;
    const shootButtonHtml = `<div><button class="bpsShootButton"><strong>Shoot!</strong></button></div>`;
    // Combine the buttons within a container div
    return `<div style="${buttonsContainerStyle}">${boulderButton}${parchmentButton}${scissorsButton}</div>${shootButtonHtml}`;
}

function updateMessageBPS(messageid, updateObject) {
    const message = game.messages.get(messageid);
    message.update(updateObject);
}
