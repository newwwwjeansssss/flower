using System.Collections.Generic;
using FlowerFit.Domain;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
namespace FlowerFit.Presentation
{
    // Flower Fit garden art with extracted Shape Fill sprites for missing obstacle visuals.
    internal sealed class FlowerObstacleOverlay
    {
        readonly RectTransform root;
        readonly List<RectTransform> items=new List<RectTransform>();
        readonly List<Image> gates=new List<Image>();
        public FlowerObstacleOverlay(RectTransform parent)
        {
            root=new GameObject("ObstacleOverlay",typeof(RectTransform)).GetComponent<RectTransform>();root.SetParent(parent,false);
            root.anchorMin=Vector2.zero;root.anchorMax=Vector2.one;root.offsetMin=root.offsetMax=Vector2.zero;
        }
        internal static Color CountedColor(int current,int required)
        {
            if(current>=required)return new Color(.16f,.68f,.36f,1f);
            return Color.Lerp(new Color(.25f,.32f,.46f,1f),new Color(.96f,.63f,.2f,1f),required<=1?0:(float)current/(required-1));
        }
        public void Render(FlowerObstacleSnapshot snapshot,FlowerFitVisualProfile profile,Rect board,int rows,int cols)
        {
            int gateCount=0;
            if(snapshot!=null && FlowerObstacleArt.GateBar!=null)foreach(var edge in snapshot.Barriers)
            {
                if(gateCount==gates.Count)
                {
                    var gate=new GameObject("GateBar",typeof(RectTransform),typeof(Image)).GetComponent<Image>();
                    gate.transform.SetParent(root,false);gate.raycastTarget=false;gate.sprite=FlowerObstacleArt.GateBar;gates.Add(gate);
                }
                var image=gates[gateCount++];image.gameObject.SetActive(true);
                var rt=image.rectTransform;rt.anchorMin=rt.anchorMax=new Vector2(.5f,.5f);
                rt.anchoredPosition=FlowerObstacleArt.EdgeCenter(edge,board,rows,cols);
                rt.sizeDelta=new Vector2(edge.Direction==0?board.height/rows:board.width/cols,Mathf.Min(board.width/cols,board.height/rows)*.18f);
                rt.localEulerAngles=new Vector3(0,0,edge.Direction==0?90:0);
                rt.SetAsFirstSibling();
            }
            for(int i=gateCount;i<gates.Count;i++)gates[i].gameObject.SetActive(false);
            int used=0;
            if(snapshot!=null)foreach(var mark in snapshot.Marks)
            {
                if(used==items.Count)
                {
                    var rt=new GameObject("Obstacle",typeof(RectTransform),typeof(RawImage)).GetComponent<RectTransform>();rt.SetParent(root,false);
                    rt.GetComponent<RawImage>().raycastTarget=false;
                    var icon=new GameObject("GardenSprite",typeof(RectTransform),typeof(Image)).GetComponent<Image>();icon.transform.SetParent(rt,false);icon.raycastTarget=false;
                    var ir=(RectTransform)icon.transform;ir.anchorMin=Vector2.zero;ir.anchorMax=Vector2.one;ir.offsetMin=ir.offsetMax=Vector2.zero;
                    var text=new GameObject("Label",typeof(RectTransform),typeof(TextMeshProUGUI)).GetComponent<TextMeshProUGUI>();text.transform.SetParent(rt,false);text.raycastTarget=false;
                    var tr=(RectTransform)text.transform;tr.anchorMin=Vector2.zero;tr.anchorMax=Vector2.one;tr.offsetMin=tr.offsetMax=Vector2.zero;
                    text.alignment=TextAlignmentOptions.Center;text.font=profile.Font;items.Add(rt);
                }
                var item=items[used++];item.gameObject.SetActive(true);var rect=FlowerFitBoardGeometry.CellRect(board,rows,cols,mark.Cell.Row,mark.Cell.Col);
                bool terminal=mark.Kind==3;
                Sprite sprite=mark.Kind==1?FlowerObstacleArt.FrozenZone:mark.Kind==2?FlowerObstacleArt.FrozenBlock:terminal?FlowerObstacleArt.GateContact:null;
                bool imported=mark.Kind!=0&&sprite!=null;
                item.anchorMin=item.anchorMax=new Vector2(.5f,.5f);
                item.anchoredPosition=rect.center+(terminal?new Vector2(0,rect.height*.19f):Vector2.zero);
                item.sizeDelta=rect.size*(terminal?.43f:mark.Kind==1&&imported?.63f:mark.Kind==2&&imported?.98f:.86f);
                var image=item.GetComponent<RawImage>();image.texture=null;
                image.color=imported?Color.clear:mark.Kind==0?CountedColor(mark.Current,mark.Required):terminal?new Color(.95f,.9f,.4f,.95f):new Color(.3f,.8f,1,.62f);
                var existingIcon=item.GetComponentInChildren<Image>(true);existingIcon.sprite=sprite;existingIcon.preserveAspect=true;existingIcon.gameObject.SetActive(sprite!=null);
                existingIcon.color=terminal?(mark.Text.EndsWith("+")?new Color(.15f,1f,.85f):new Color(.1f,.65f,.85f)):mark.Kind==0?new Color(.8f,.65f,.4f):Color.white;
                var label=item.GetComponentInChildren<TextMeshProUGUI>();
                label.text=mark.Kind==1&&imported?"":terminal&&imported?mark.Text.TrimEnd('+','-'):mark.Text;
                label.rectTransform.anchoredPosition=terminal&&imported?new Vector2(0,-rect.height*.34f):Vector2.zero;
                label.fontSize=rect.width*(terminal?.22f:mark.Kind==0?.31f:.24f);label.color=Color.white;label.fontStyle=FontStyles.Bold;
                label.outlineWidth=imported?.18f:0;label.outlineColor=new Color32(38,56,79,255);
            }
            for(int i=used;i<items.Count;i++)items[i].gameObject.SetActive(false);root.SetAsLastSibling();
        }
    }
}
