using FlowerFit.Domain;
using UnityEngine;
namespace FlowerFit.Presentation
{
    internal static class FlowerObstacleArt
    {
        public static readonly Sprite FrozenZone=Resources.Load<Sprite>("FlowerFitObstacleArt/FrozenZone");
        public static readonly Sprite FrozenBlock=Resources.Load<Sprite>("FlowerFitObstacleArt/FrozenBlock");
        public static readonly Sprite GateContact=Resources.Load<Sprite>("FlowerFitObstacleArt/GateContact");
        public static readonly Sprite GateBar=Resources.Load<Sprite>("FlowerFitObstacleArt/GateBar");
        public static Vector2 EdgeCenter(GridWall edge,Rect board,int rows,int cols)
        {
            var a=FlowerFitBoardGeometry.CellRect(board,rows,cols,edge.Cell.Row,edge.Cell.Col);
            var b=FlowerFitBoardGeometry.CellRect(board,rows,cols,edge.Other.Row,edge.Other.Col);
            return (a.center+b.center)*.5f;
        }
    }
}
