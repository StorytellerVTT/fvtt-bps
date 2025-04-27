const BPS_IMAGES = {
  boulder: "https://raw.githubusercontent.com/StorytellerVTT/fvtt-bps/main/assets/boulder.png",
  parchment: "https://raw.githubusercontent.com/StorytellerVTT/fvtt-bps/main/assets/parchment.png",
  shears: "https://raw.githubusercontent.com/StorytellerVTT/fvtt-bps/main/assets/shears.png"
};

Hooks.once('ready', async function() {
  console.log("Boulder Parchment Shears PvP module is ready!");

  game.boulderParchmentShears = {
    challenge: async () => {
      let users = game.users.contents.filter(u => u.active && !u.isGM && u.id !== game.user.id);
      if (users.length === 0) {
        ui.notifications.warn("No available players to challenge!");
        return;
      }

      let userOptions = users.reduce((obj, u) => {
        obj[u.id] = u.name;
        return obj;
      }, {});

      let targetUserId = await new Promise((resolve) => {
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

      const challenger = game.user;
      const challenged = game.users.get(targetUserId);

      game.socket.emit('module.boulder-parchment-shears', {
        type: "startChallenge",
        challengerId: challenger.id,
        challengedId: challenged.id
      });
    }
  };

  game.socket.on('module.boulder-parchment-shears', async (data) => {
    if (data.type === "startChallenge") {
      const { challengerId, challengedId } = data;

      if (game.user.id === challengedId) {
        pickChoice(challengerId, challengedId);
      }
      if (game.user.id === challengerId) {
        pickChoice(challengerId, challengedId);
      }
    }
    else if (data.type === "submitChoice") {
      handleChoiceSubmission(data);
    }
  });

  let choicesMade = {};

  async function pickChoice(challengerId, challengedId) {
    let content = `
      <style>
        .bps-choice { width: 100px; cursor: pointer; margin: 5px; }
        .bps-container { display: flex; justify-content: space-around; }
      </style>
      <div class="bps-container">
        ${Object.entries(BPS_IMAGES).map(([key, img]) => `
          <img src="${img}" class="bps-choice" data-choice="${key}" />
        `).join('')}
      </div>
    `;

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: "Pick Your Move!",
        content,
        buttons: {},
        render: html => {
          html.find('.bps-choice').click(ev => {
            const choice = ev.currentTarget.dataset.choice;
            dialog.close();
            game.socket.emit('module.boulder-parchment-shears', {
              type: "submitChoice",
              playerId: game.user.id,
              challengerId,
              challengedId,
              choice
            });
            resolve();
          });
        }
      }).render(true);
    });
  }

  async function handleChoiceSubmission({ playerId, challengerId, challengedId, choice }) {
    const gameId = `${challengerId}-${challengedId}`;
    if (!choicesMade[gameId]) choicesMade[gameId] = {};

    choicesMade[gameId][playerId] = choice;

    if (choicesMade[gameId][challengerId] && choicesMade[gameId][challengedId]) {
      const playerAChoice = choicesMade[gameId][challengerId];
      const playerBChoice = choicesMade[gameId][challengedId];

      let result = determineWinner(playerAChoice, playerBChoice);

      ChatMessage.create({
        content: `
          <h2>Boulder Parchment Shears Result!</h2>
          <p><strong>${game.users.get(challengerId).name}</strong> chose:<br><img src="${BPS_IMAGES[playerAChoice]}" width="100"/></p>
          <p><strong>${game.users.get(challengedId).name}</strong> chose:<br><img src="${BPS_IMAGES[playerBChoice]}" width="100"/></p>
          <h3>${result}</h3>
        `
      });

      delete choicesMade[gameId];
    }
  }

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
});

// Listen for chat commands
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  if (message.toLowerCase() === "bps") {
    game.boulderParchmentShears.challenge();
    return false; // Prevents it from posting to chat
  }
});
