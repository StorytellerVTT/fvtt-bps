// Boulder Parchment Shears - FINAL FULL VERSION (GM-driven, hover, sound, safe closures)

const BPS_IMAGES = {
  boulder: "modules/boulder-parchment-shears/assets/Boulder.png",
  parchment: "modules/boulder-parchment-shears/assets/Parchment.png",
  shears: "modules/boulder-parchment-shears/assets/Shears.png"
};

const BPS_SOUND = "sounds/lock.wav"; // Built-in Foundry sound (can replace with your own)
const choicesMade = {};
let bpsSocket;

// Setup everything at world ready
Hooks.once('ready', async function() {
  console.log("[BPS] Setting up Boulder Parchment Shears...");

  if (!game.modules.get('socketlib')?.active) {
    ui.notifications.error("Boulder Parchment Shears requires Socketlib module.");
    return;
  }

  bpsSocket = socketlib.registerModule('boulder-parchment-shears');
  bpsSocket.register('startChallenge', startChallenge);
  bpsSocket.register('promptChoice', promptChoice);
  bpsSocket.register('submitChoice', handleChoiceSubmission);

  game.boulderParchmentShears = {
    challenge: async () => {
      const users = game.users.contents.filter(u => u.active && !u.isGM && u.id !== game.user.id);
      if (users.length === 0) {
        ui.notifications.warn("No available players to challenge!");
        return;
      }

      const userOptions = users.reduce((obj, u) => {
        obj[u.id] = u.name;
        return obj;
      }, {});

      const targetUserId = await new Promise((resolve) => {
        new Dialog({
          title: "Challenge a Player",
          content: "<p>Who do you want to challenge?</p>",
          buttons: Object.entries(userOptions).reduce((btns, [id, name]) => {
            btns[id] = {
              label: name,
              callback: () => resolve(id)
            };
            return btns;
          }, {}),
          close: () => resolve(null)
        }).render(true);
      });

      if (!targetUserId) return;

      const challengerId = game.user.id;
      const challengedId = targetUserId;

      console.log("[BPS] Requesting promptChoice for:", challengerId, challengedId);

      if (game.user.isGM) {
        await startChallenge({ challengerId, challengedId });
      } else {
        await bpsSocket.executeAsGM("startChallenge", { challengerId, challengedId });
      }
    }
  };
});

// GM-only: start the challenge
async function startChallenge({ challengerId, challengedId }) {
  console.log("[BPS] GM starting challenge between", challengerId, "and", challengedId);

  await bpsSocket.executeForEveryone("promptChoice", { challengerId, challengedId });
}

// Players pick Boulder/Parchment/Shears
async function promptChoice({ challengerId, challengedId }) {
  if (![challengerId, challengedId].includes(game.user.id)) return; // Only involved users

  const content = `
    <style>
      .bps-container { display: flex; justify-content: center; gap: 20px; margin-top: 10px; }
      .bps-choice { width: 150px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
      .bps-choice:hover { transform: scale(1.1); box-shadow: 0 0 10px gold; }
    </style>
    <div class="bps-container">
      ${Object.entries(BPS_IMAGES).map(([key, img]) => `
        <img src="${img}" class="bps-choice" data-choice="${key}" title="${key.charAt(0).toUpperCase() + key.slice(1)}" />
      `).join('')}
    </div>
  `;

  const dlg = new Dialog({
    title: "Pick Your Move!",
    content,
    buttons: {}
  });

  dlg.render(true);

  Hooks.once('renderDialog', (app, html, data) => {
    if (app.id !== dlg.id) return; // Only hook our specific dialog

    html.find('.bps-choice').click(ev => {
      const choice = ev.currentTarget.dataset.choice;
      AudioHelper.play({ src: BPS_SOUND, volume: 0.8, autoplay: true, loop: false }, true);
      dlg.close();
      bpsSocket.executeAsGM('submitChoice', {
        playerId: game.user.id,
        challengerId,
        challengedId,
        choice
      });
    });
  });
}

// Handle when players submit their move
async function handleChoiceSubmission({ playerId, challengerId, challengedId, choice }) {
  const gameId = `${challengerId}-${challengedId}`;
  if (!choicesMade[gameId]) choicesMade[gameId] = {};

  choicesMade[gameId][playerId] = choice;

  if (choicesMade[gameId][challengerId] && choicesMade[gameId][challengedId]) {
    const challengerChoice = choicesMade[gameId][challengerId];
    const challengedChoice = choicesMade[gameId][challengedId];

    const result = determineWinner(challengerChoice, challengedChoice);

    ChatMessage.create({
      content: `
        <h2>Boulder Parchment Shears Result!</h2>
        <div style="display: flex; justify-content: space-around; align-items: center; margin-top: 10px;">
          <div style="text-align: center;">
            <strong>${game.users.get(challengerId)?.name || "Unknown"}</strong><br>
            <img src="${BPS_IMAGES[challengerChoice]}" width="100">
          </div>
          <div style="text-align: center;">
            <strong>${game.users.get(challengedId)?.name || "Unknown"}</strong><br>
            <img src="${BPS_IMAGES[challengedChoice]}" width="100">
          </div>
        </div>
        <h3 style="text-align: center;">${result}</h3>
      `
    });

    delete choicesMade[gameId];
  }
}

// Determine winner
function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return "It's a Tie!";
  if (
    (choice1 === 'boulder' && choice2 === 'shears') ||
    (choice1 === 'parchment' && choice2 === 'boulder') ||
    (choice1 === 'shears' && choice2 === 'parchment')
  ) {
    return "First player wins!";
  } else {
    return "Second player wins!";
  }
}

// Hook for /bps chat command
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  if (message.toLowerCase() === "bps") {
    console.log("[BPS] /bps chat command triggered");
    game.boulderParchmentShears.challenge();
    return false;
  }
});