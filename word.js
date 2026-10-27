// server/words.js
const words = {
  easy: [
    "cat", "dog", "sun", "moon", "star", "tree", "house", "car", "bus", "fish",
    "ball", "book", "bird", "cake", "door", "egg", "fire", "gift", "hat", "ice",
    "kite", "lamp", "milk", "nose", "orange", "pen", "queen", "rain", "shoe", "table",
    "umbrella", "van", "watch", "box", "yo-yo", "zebra", "apple", "banana", "chair", "drum",
    "eye", "flower", "guitar", "heart", "island", "juice", "key", "lion", "mouse", "net",
    "ocean", "pizza", "ring", "snake", "train", "violin", "whale", "cup", "fan", "globe"
  ],
  medium: [
    "airplane", "basketball", "butterfly", "calendar", "dinosaur", "elephant", "football",
    "giraffe", "hamburger", "internet", "jellyfish", "kangaroo", "lighthouse", "motorcycle",
    "newspaper", "octopus", "parachute", "rainbow", "sandwich", "telescope", "unicorn",
    "volleyball", "waterfall", "xylophone", "passport", "scissors", "triangle", "diamond",
    "rocket", "bicycle", "camera", "dolphin", "escalator", "fireworks", "glasses",
    "helicopter", "iceberg", "jacket", "keyboard", "lollipop", "magnet", "necklace",
    "painting", "question", "robot", "stadium", "tornado", "umbrella", "volcano", "windmill"
  ],
  hard: [
    "astronomy", "bluetooth", "chameleon", "democracy", "earthquake", "flashback",
    "greenhouse", "histogram", "illusion", "jigsaw puzzle", "kaleidoscope", "labyrinth",
    "metabolism", "nightmare", "orchestra", "philosophy", "quarantine", "revolution",
    "silhouette", "trampoline", "underground", "ventriloquist", "weightlifting",
    "imagination", "civilization", "electricity", "temperature", "skyscraper",
    "photography", "constellation", "archaeology", "camouflage", "evolution",
    "gravity", "hieroglyphics", "immigration", "jurisdiction", "bankruptcy",
    "microphone", "negotiation", "observatory", "perspective", "reflection"
  ]
};

function getRandomWords(count = 3) {
  const allWords = [...words.easy, ...words.medium, ...words.hard];
  const shuffled = allWords.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getWordDifficulty(word) {
  if (words.easy.includes(word)) return 'easy';
  if (words.medium.includes(word)) return 'medium';
  return 'hard';
}

module.exports = { words, getRandomWords, getWordDifficulty };