export class Token {
  constructor({
    id, name, type, sizeCells = 1, color = "#5aa9ff",
    x = 0, y = 0, ac = 10, hp = "1/1", speed = 30, notes = "", statblock = ""
  }) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.sizeCells = sizeCells;
    this.color = color;
    this.x = x; this.y = y;

    this.ac = ac;
    this.hp = hp;
    this.speed = speed;
    this.notes = notes;
    this.statblock = statblock;
  }
}
